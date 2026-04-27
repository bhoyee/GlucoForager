from datetime import datetime
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...core.config import settings
from ...database import SessionLocal, get_db
from ...models.admin_email_campaign import AdminEmailCampaign
from ...models.admin_user import AdminUser
from ...models.user import User
from ...services.cache_service import CacheService
from ...services.email_service import send_newsletter_email

router = APIRouter(prefix="/admin/user-email", tags=["admin-user-email"])
cache = CacheService()
logger = logging.getLogger(__name__)


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
            Official update - {timestamp}
          </p>
          <h2 style="color:#0FB7A5; margin-top:0;">{safe_subject}</h2>
          <div style="line-height:1.6; font-size:14px; color:#0C1824;">{safe_body}</div>
          <p style="margin-top:24px; color:#6b7280; font-size:12px;">
            If you didn't expect this email, contact support at
            <a href="mailto:hello@glucoforager.com" style="color:#0FB7A5;">hello@glucoforager.com</a>.
          </p>
        </div>
      </body>
    </html>
    """


def _send_broadcast_user_email(
    *,
    campaign_id: int | None,
    subject: str,
    html_body: str,
    emails: list[str],
    admin_id: int | None = None,
) -> None:
    total = len(emails)
    logger.info(
        "User email broadcast start campaign_id=%s total=%s admin_id=%s",
        campaign_id,
        total,
        admin_id,
    )
    sent = 0
    db: Session | None = None
    try:
        if campaign_id is not None:
            db = SessionLocal()

        for idx, email in enumerate(emails, start=1):
            try:
                send_newsletter_email(email, subject, html_body)
                sent += 1
            except Exception:
                logger.exception("User email broadcast send failed email=%s campaign_id=%s", email, campaign_id)

            if db is not None and (idx % 25 == 0 or idx == total):
                try:
                    db.query(AdminEmailCampaign).filter(AdminEmailCampaign.id == campaign_id).update(
                        {"sent_count": sent}
                    )
                    db.commit()
                except Exception:
                    logger.exception("User email broadcast progress update failed campaign_id=%s", campaign_id)
                    db.rollback()

        logger.info(
            "User email broadcast complete campaign_id=%s sent=%s total=%s admin_id=%s",
            campaign_id,
            sent,
            total,
            admin_id,
        )
    finally:
        if db is not None:
            db.close()


@router.post("/send", status_code=200, response_model=dict)
def send_user_email(
    payload: AdminUserEmailSendPayload,
    background_tasks: BackgroundTasks,
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
        test_email = str(payload.test_email).strip().lower()
        send_newsletter_email(test_email, payload.subject.strip(), html_body)
        db.add(
            AdminEmailCampaign(
                kind="user_email",
                mode="test",
                subject=payload.subject.strip(),
                body=payload.body,
                body_html=bool(payload.body_html),
                test_email=test_email,
                sent_count=1,
                total_count=1,
                created_by_admin_id=current_admin.id,
            )
        )
        db.commit()
        return {"ok": True, "sent": 1, "mode": "test"}

    if mode == "single":
        if not payload.recipient_email:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="recipient_email is required")
        recipient_email = str(payload.recipient_email).strip().lower()
        send_newsletter_email(recipient_email, payload.subject.strip(), html_body)
        db.add(
            AdminEmailCampaign(
                kind="user_email",
                mode="single",
                subject=payload.subject.strip(),
                body=payload.body,
                body_html=bool(payload.body_html),
                recipient_email=recipient_email,
                sent_count=1,
                total_count=1,
                created_by_admin_id=current_admin.id,
            )
        )
        db.commit()
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

    campaign = AdminEmailCampaign(
        kind="user_email",
        mode="broadcast",
        subject=payload.subject.strip(),
        body=payload.body,
        body_html=bool(payload.body_html),
        sent_count=0,
        total_count=len(emails),
        created_by_admin_id=current_admin.id,
    )
    campaign_id: int | None = None
    try:
        db.add(campaign)
        db.commit()
        db.refresh(campaign)
        campaign_id = campaign.id
    except Exception:
        logger.exception("User email broadcast: failed to persist campaign record")
        db.rollback()

    background_tasks.add_task(
        _send_broadcast_user_email,
        campaign_id=campaign_id,
        subject=payload.subject.strip(),
        html_body=html_body,
        emails=emails,
        admin_id=getattr(current_admin, "id", None),
    )

    return {
        "ok": True,
        "queued": True,
        "campaign_id": campaign_id,
        "mode": "broadcast",
        "sent": 0,
        "total": len(emails),
    }
