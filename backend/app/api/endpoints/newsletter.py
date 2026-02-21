from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.newsletter_signup import NewsletterSignup
from ...services.cache_service import CacheService

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
    return (request.client.host if request.client else "unknown")[:64]


@router.post("/subscribe", status_code=201)
def subscribe(payload: NewsletterSubscribePayload, request: Request, db: Session = Depends(get_db)):  # noqa: ARG001
    if payload.website and payload.website.strip():
        raise HTTPException(status_code=400, detail="Invalid request")

    ip = _client_ip(request)
    ip_count = cache.incr(f"newsletter:ip:{ip}", ttl_seconds=60 * 60)
    if ip_count > 10:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    email = str(payload.email).strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Invalid email")

    email_count = cache.incr(f"newsletter:email:{email}", ttl_seconds=24 * 60 * 60)
    if email_count > 10:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    existing = db.query(NewsletterSignup).filter(NewsletterSignup.email == email).first()
    if existing:
        if existing.status != "subscribed":
            existing.status = "subscribed"
        if payload.source:
            existing.source = payload.source.strip()[:80]
        db.commit()
        return {"ok": True, "already": True}

    signup = NewsletterSignup(
        email=email,
        source=payload.source.strip()[:80] if payload.source else None,
        status="subscribed",
        created_at=_utcnow(),
    )
    db.add(signup)
    db.commit()
    return {"ok": True}
