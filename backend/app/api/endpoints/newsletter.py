from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.newsletter_signup import NewsletterSignup

router = APIRouter(prefix="/newsletter", tags=["newsletter"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class NewsletterSubscribePayload(BaseModel):
    email: EmailStr
    source: str | None = Field(None, max_length=80)


@router.post("/subscribe", status_code=201)
def subscribe(payload: NewsletterSubscribePayload, request: Request, db: Session = Depends(get_db)):  # noqa: ARG001
    email = str(payload.email).strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Invalid email")

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

