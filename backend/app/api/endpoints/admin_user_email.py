from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...core.config import settings
from ...database import get_db
from ...models.admin_user import AdminUser
from ...models.user import User
from ...services.cache_service import CacheService
from ...services.email_service import send_newsletter_email

router = APIRouter(prefix="/admin/user-email", tags=["admin-user-email"])
cache = CacheService()


class AdminUserEmailSendPayload(BaseModel):
    subject: str = Field(..., min_length=2, max_length=160)
    body: str = Field(..., min_length=2, max_length=50000)
    body_html: bool = False
    mode: str = Field("test", max_length=20)  # test | single | broadcast
    test_email: EmailStr | None = None
    recipient_email: EmailStr | None = None


def _escape_html(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _render_user_email_html(subject: str, body: str, body_html: bool = False) -> str:
    safe_subject = _escape_html(subject.strip())
    if body_html:
        safe_body = (body or "").strip()
    else:
        safe_body = _escape_html(body.strip()).replace("\n", "<br />")
    logo_url = f"{settings.site_url.rstrip('/')}/images/logo.png"
    timestamp = datetime.utcnow().strftime("%b %d, %Y %H:%M UTC")
    return f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:620px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
            <img src="{logo_url}" alt="GlucoForager" width="36" height="36" style="display:block; border-radius:10px;" />
            <div style="font-weight:800; font-size:18px; color:#0C1824;">GlucoForager</div>
          </div>
          <p style="margin:0 0 10px 0; color:#6b7280; font-size:12px;">
            Official update â€¢ {timestamp}
          </p>
          <h2 style="color:#0FB7A5; margin-top:0;">{safe_subject}</h2>
          <div style="line-height:1.6; font-size:14px; color:#0C1824;">{safe_body}</div>
          <p style="margin-top:24px; color:#6b7280; font-size:12px;">
            If you didnâ€™t expect this email, contact support at
            <a href="mailto:hello@glucoforager.com" style="color:#0FB7A5;">hello@glucoforager.com</a>.
          </p>
        </div>
      </body>
    </html>
    """


@router.post("/send", status_code=200, response_model=dict)
def send_user_email(
    payload: AdminUserEmailSendPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    mode = (payload.mode or "test").strip().lower()
    if mode not in {"test", "single", "broadcast"}:
        raise HTTPException(status_code=400, detail="Invalid mode")

    # Soft guardrail: prevent spamming the endpoint.
    send_count = cache.incr(f"user-email:send:admin:{current_admin.id}", ttl_seconds=60 * 60)
    if send_count > 6:
        raise HTTPException(status_code=429, detail="Too many sends. Please try again later.")

    html_body = _render_user_email_html(payload.subject, payload.body, body_html=bool(payload.body_html))

    if mode == "test":
        if not payload.test_email:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="test_email is required")
        send_newsletter_email(str(payload.test_email).strip().lower(), payload.subject.strip(), html_body)
        return {"ok": True, "sent": 1, "mode": "test"}

    if mode == "single":
        if not payload.recipient_email:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="recipient_email is required")
        send_newsletter_email(str(payload.recipient_email).strip().lower(), payload.subject.strip(), html_body)
        return {"ok": True, "sent": 1, "mode": "single"}

    recipients = (
        db.query(User.email)
        .filter(User.email.is_not(None))
        .order_by(desc(User.created_at), desc(User.id))
        .limit(2000)
        .all()
    )
    emails = []
    for (email,) in recipients:
        normalized = (email or "").strip().lower()
        if normalized:
            emails.append(normalized)
    # De-duplicate while preserving order (recent first)
    emails = list(dict.fromkeys(emails))

    sent = 0
    for email in emails:
        try:
            send_newsletter_email(email, payload.subject.strip(), html_body)
            sent += 1
        except Exception:
            continue

    return {"ok": True, "sent": sent, "mode": "broadcast", "total": len(emails)}

