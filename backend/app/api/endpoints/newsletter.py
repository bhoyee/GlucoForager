from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ...services.newsletter_tokens import verify_unsubscribe_token
from ...database import get_db
from ...models.newsletter_signup import NewsletterSignup
from ...services.cache_service import CacheService
from ...services.email_service import send_free_guide_email, send_newsletter_subscribed_email

router = APIRouter(prefix="/newsletter", tags=["newsletter"])
cache = CacheService()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class NewsletterSubscribePayload(BaseModel):
    email: EmailStr
    source: str | None = Field(None, max_length=80)
    website: str | None = Field(None, max_length=200)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]


async def _newsletter_payload_from_request(request: Request) -> NewsletterSubscribePayload:
    content_type = (request.headers.get("content-type") or "").lower()
    try:
        if "application/json" in content_type:
            raw = await request.json()
        else:
            form = await request.form()
            raw = dict(form)
        return NewsletterSubscribePayload.model_validate(raw)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid request") from exc


@router.post("/subscribe", status_code=201)
async def subscribe(request: Request, db: Session = Depends(get_db)):
    payload = await _newsletter_payload_from_request(request)
    if payload.website and payload.website.strip():
        raise HTTPException(status_code=400, detail="Invalid request")

    ip = _client_ip(request)
    ip_count = cache.incr(f"newsletter:ip:{ip}", ttl_seconds=60 * 60)
    if ip_count > 30:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    email = str(payload.email).strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Invalid email")

    email_count = cache.incr(f"newsletter:email:{email}", ttl_seconds=24 * 60 * 60)
    if email_count > 20:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    source = (payload.source or "").strip()[:80]
    is_free_guide = source.startswith("free-guide")

    existing = db.query(NewsletterSignup).filter(NewsletterSignup.email == email).first()
    if existing:
        if is_free_guide:
            try:
                send_free_guide_email(existing.email, existing.id)
            except Exception:
                pass
            return {"ok": True, "already": True, "guide_sent": True, "saved": False}

        was_unsubscribed = existing.status != "subscribed"
        if was_unsubscribed:
            existing.status = "subscribed"
        if source:
            existing.source = source
        db.commit()
        if was_unsubscribed:
            try:
                send_newsletter_subscribed_email(existing.email, existing.id)
            except Exception:
                pass
        return {"ok": True, "already": True, "guide_sent": False, "saved": False}

    signup = NewsletterSignup(
        email=email,
        source=source or None,
        status="subscribed",
        created_at=_utcnow(),
    )
    db.add(signup)
    db.commit()
    db.refresh(signup)
    try:
        if is_free_guide:
            send_free_guide_email(signup.email, signup.id)
        else:
            send_newsletter_subscribed_email(signup.email, signup.id)
    except Exception:
        # Email may not be configured; subscription should still succeed.
        pass
    return {"ok": True, "emailed": True, "guide_sent": is_free_guide, "saved": True}


@router.get("/unsubscribe", status_code=200)
def unsubscribe(token: str, db: Session = Depends(get_db)):
    token = (token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Invalid unsubscribe link")

    # Token contains subscriber id + signature. We lookup the subscriber by id, then verify signature
    # with the subscriber's current email to prevent tampering.
    try:
        # Decode ID without trusting it fully; verify_unsubscribe_token checks id match.
        # We intentionally avoid leaking whether an email exists.
        # Token format: base64url("{id}:{sig}")
        import base64

        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        subscriber_id = int(raw.split(":", 1)[0])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid unsubscribe link") from None

    subscriber = db.query(NewsletterSignup).filter(NewsletterSignup.id == subscriber_id).first()
    if not subscriber:
        raise HTTPException(status_code=400, detail="Invalid unsubscribe link")

    if not verify_unsubscribe_token(token, subscriber.id, subscriber.email):
        raise HTTPException(status_code=400, detail="Invalid unsubscribe link")

    if subscriber.status != "unsubscribed":
        subscriber.status = "unsubscribed"
        db.commit()
        return {"ok": True, "unsubscribed": True}

    return {"ok": True, "unsubscribed": False, "already": True}
