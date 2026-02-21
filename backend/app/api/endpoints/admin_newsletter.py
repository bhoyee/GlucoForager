from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import desc, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.admin_user import AdminUser
from ...models.newsletter_signup import NewsletterSignup
from ...services.cache_service import CacheService
from ...services.email_service import send_newsletter_email

router = APIRouter(prefix="/admin/newsletter", tags=["admin-newsletter"])
cache = CacheService()


class NewsletterSubscriberItem(BaseModel):
    id: int
    email: str
    status: str
    source: str | None = None
    created_at: datetime | None = None


class NewsletterSubscribersResponse(BaseModel):
    items: list[NewsletterSubscriberItem]
    page: int
    page_size: int
    total: int


class NewsletterSubscriberUpdatePayload(BaseModel):
    email: EmailStr | None = None
    status: str | None = Field(None, max_length=20)
    source: str | None = Field(None, max_length=80)


class NewsletterSendPayload(BaseModel):
    subject: str = Field(..., min_length=2, max_length=160)
    body: str = Field(..., min_length=2, max_length=50000)
    test_email: EmailStr | None = None


@router.get("/subscribers", response_model=NewsletterSubscribersResponse)
def list_subscribers(
    page: int = 1,
    page_size: int = 50,
    q: str | None = None,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    page = max(1, page)
    page_size = min(max(1, page_size), 200)

    query = db.query(NewsletterSignup)
    if status_filter:
        query = query.filter(NewsletterSignup.status == status_filter.strip().lower())
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(NewsletterSignup.email.ilike(term), NewsletterSignup.source.ilike(term)))

    total = query.count()
    items = (
        query.order_by(desc(NewsletterSignup.created_at), desc(NewsletterSignup.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return NewsletterSubscribersResponse(
        items=[
            NewsletterSubscriberItem(
                id=row.id,
                email=row.email,
                status=row.status,
                source=row.source,
                created_at=row.created_at,
            )
            for row in items
        ],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.put("/subscribers/{subscriber_id}", response_model=NewsletterSubscriberItem)
def update_subscriber(
    subscriber_id: int,
    payload: NewsletterSubscriberUpdatePayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    subscriber = db.query(NewsletterSignup).filter(NewsletterSignup.id == subscriber_id).first()
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")

    if payload.status is not None:
        normalized_status = payload.status.strip().lower()
        if normalized_status not in {"subscribed", "unsubscribed"}:
            raise HTTPException(status_code=400, detail="Invalid status")
        subscriber.status = normalized_status

    if payload.email is not None:
        subscriber.email = str(payload.email).strip().lower()

    if payload.source is not None:
        subscriber.source = payload.source.strip()[:80] if payload.source else None

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already exists") from None

    return NewsletterSubscriberItem(
        id=subscriber.id,
        email=subscriber.email,
        status=subscriber.status,
        source=subscriber.source,
        created_at=subscriber.created_at,
    )


@router.delete("/subscribers/{subscriber_id}", status_code=204)
def delete_subscriber(
    subscriber_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    subscriber = db.query(NewsletterSignup).filter(NewsletterSignup.id == subscriber_id).first()
    if not subscriber:
        return
    db.delete(subscriber)
    db.commit()
    return


def _escape_html(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _render_newsletter_html(subject: str, body: str) -> str:
    safe_subject = _escape_html(subject.strip())
    safe_body = _escape_html(body.strip()).replace("\n", "<br />")
    return f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:620px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <h2 style="color:#0FB7A5; margin-top:0;">{safe_subject}</h2>
          <div style="line-height:1.6; font-size:14px; color:#0C1824;">{safe_body}</div>
          <p style="margin-top:24px; color:#6b7280; font-size:12px;">
            You received this email because you subscribed to GlucoForager updates.
          </p>
        </div>
      </body>
    </html>
    """


@router.post("/send", status_code=200, response_model=dict)
def send_broadcast(
    payload: NewsletterSendPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    # Soft guardrail: prevent spamming the endpoint.
    send_count = cache.incr(f"newsletter:send:admin:{current_admin.id}", ttl_seconds=60 * 60)
    if send_count > 3:
        raise HTTPException(status_code=429, detail="Too many sends. Please try again later.")

    html_body = _render_newsletter_html(payload.subject, payload.body)

    if payload.test_email:
        send_newsletter_email(str(payload.test_email).strip().lower(), payload.subject.strip(), html_body)
        return {"ok": True, "sent": 1, "mode": "test"}

    recipients = (
        db.query(NewsletterSignup)
        .filter(NewsletterSignup.status == "subscribed")
        .order_by(desc(NewsletterSignup.created_at), desc(NewsletterSignup.id))
        .limit(2000)
        .all()
    )

    sent = 0
    for recipient in recipients:
        try:
            send_newsletter_email(recipient.email, payload.subject.strip(), html_body)
            sent += 1
        except Exception:
            # Do not fail the whole send because of one address/provider error.
            continue

    return {"ok": True, "sent": sent, "mode": "broadcast"}

