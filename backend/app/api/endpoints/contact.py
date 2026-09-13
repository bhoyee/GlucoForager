from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, ValidationError

from ...services.cache_service import CacheService
from ...services.email_service import send_contact_form_email

router = APIRouter(prefix="/contact", tags=["contact"])
cache = CacheService()

CONTACT_RATE_LIMIT_PER_HOUR = 10


class ContactPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    subject: str = Field("", max_length=120)
    message: str = Field(..., min_length=1, max_length=5000)
    # Honeypot - real visitors never see or fill this field (hidden in the form).
    # Any bot that fills every input gets silently no-op'd, same pattern already
    # used by the newsletter signup endpoint.
    website: str | None = Field(None, max_length=200)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]


@router.post("", status_code=200)
async def submit_contact_form(request: Request):
    try:
        raw = await request.json()
        payload = ContactPayload.model_validate(raw)
    except ValidationError:
        raise HTTPException(status_code=422, detail="Please fill in your name, email, and a message.") from None
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request") from None

    if payload.website and payload.website.strip():
        # Honeypot tripped - pretend success so the bot doesn't learn anything.
        return {"ok": True}

    ip = _client_ip(request)
    if cache.incr(f"contact:ip:{ip}", ttl_seconds=60 * 60) > CONTACT_RATE_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many messages sent. Please try again later.")

    try:
        send_contact_form_email(
            name=payload.name,
            email=str(payload.email),
            subject=payload.subject,
            message=payload.message,
        )
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Unable to send your message right now. Please email hello@glucoforager.com directly.",
        ) from None

    return {"ok": True}
