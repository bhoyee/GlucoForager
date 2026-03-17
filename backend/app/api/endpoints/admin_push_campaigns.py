from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...core.config import settings
from ...database import SessionLocal, get_db
from ...models.admin_push_campaign import AdminPushCampaign
from ...models.admin_push_send import AdminPushSend, AdminPushSendFailure
from ...models.push_token import PushToken
from ...models.user import User
from ...services.expo_push_service import send_expo_push_messages


router = APIRouter(prefix="/admin/push-campaigns", tags=["admin-push-campaigns"])


class PushCampaignPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=80)
    body: str = Field(..., min_length=1, max_length=500)
    deeplink: str | None = Field(None, max_length=200)
    audience: str = Field("all", max_length=32)
    status: str = Field("draft", max_length=32)


def _clean_audience(value: str) -> str:
    audience = (value or "all").strip().lower()
    if audience not in {"all", "free", "premium"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported audience.")
    return audience


def _clean_status(value: str) -> str:
    status_value = (value or "draft").strip().lower()
    if status_value not in {"draft", "archived"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported status.")
    return status_value


def _campaign_item(row: AdminPushCampaign) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "body": row.body,
        "deeplink": row.deeplink,
        "audience": row.audience,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _send_item(row: AdminPushSend) -> dict:
    return {
        "id": row.id,
        "campaign_id": row.campaign_id,
        "provider": row.provider,
        "mode": row.mode,
        "status": row.status,
        "queued_at": row.queued_at.isoformat() if row.queued_at else None,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
        "total_tokens": row.total_tokens,
        "success_count": row.success_count,
        "failure_count": row.failure_count,
        "error_summary": row.error_summary,
    }


@router.get("")
def list_campaigns(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),  # noqa: ARG001
):
    campaigns = (
        db.query(AdminPushCampaign)
        .filter(AdminPushCampaign.deleted_at.is_(None))
        .order_by(AdminPushCampaign.created_at.desc())
        .limit(200)
        .all()
    )
    active_tokens = (
        db.query(PushToken).filter(PushToken.provider == "expo", PushToken.enabled.is_(True)).count()
    )
    recent_tokens = (
        db.query(PushToken)
        .filter(PushToken.provider == "expo")
        .order_by(PushToken.last_seen_at.desc().nullslast(), PushToken.id.desc())
        .limit(10)
        .all()
    )
    return {
        "provider": "expo",
        "expo_endpoint": settings.expo_push_endpoint,
        "active_tokens": active_tokens,
        "recent_tokens": [
            {
                "id": t.id,
                "user_id": t.user_id,
                "platform": t.platform,
                "enabled": bool(t.enabled),
                "last_seen_at": t.last_seen_at.isoformat() if t.last_seen_at else None,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in recent_tokens
        ],
        "items": [_campaign_item(row) for row in campaigns],
    }


@router.post("")
def create_campaign(
    payload: PushCampaignPayload,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    now = datetime.utcnow()
    row = AdminPushCampaign(
        title=payload.title.strip(),
        body=payload.body.strip(),
        deeplink=payload.deeplink.strip() if isinstance(payload.deeplink, str) and payload.deeplink.strip() else None,
        audience=_clean_audience(payload.audience),
        status=_clean_status(payload.status),
        created_by_admin_id=getattr(current_admin, "id", None),
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _campaign_item(row)


@router.put("/{campaign_id}")
def update_campaign(
    campaign_id: int,
    payload: PushCampaignPayload,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),  # noqa: ARG001
):
    row = db.query(AdminPushCampaign).filter(AdminPushCampaign.id == campaign_id, AdminPushCampaign.deleted_at.is_(None)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    row.title = payload.title.strip()
    row.body = payload.body.strip()
    row.deeplink = payload.deeplink.strip() if isinstance(payload.deeplink, str) and payload.deeplink.strip() else None
    row.audience = _clean_audience(payload.audience)
    row.status = _clean_status(payload.status)
    row.updated_at = datetime.utcnow()
    db.commit()
    return _campaign_item(row)


@router.delete("/{campaign_id}")
def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),  # noqa: ARG001
):
    row = (
        db.query(AdminPushCampaign)
        .filter(AdminPushCampaign.id == campaign_id, AdminPushCampaign.deleted_at.is_(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    now = datetime.utcnow()
    row.deleted_at = now
    row.updated_at = now
    db.commit()
    return {"status": "deleted", "id": row.id}


@router.get("/{campaign_id}")
def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),  # noqa: ARG001
):
    row = db.query(AdminPushCampaign).filter(AdminPushCampaign.id == campaign_id, AdminPushCampaign.deleted_at.is_(None)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    sends = (
        db.query(AdminPushSend)
        .filter(AdminPushSend.campaign_id == campaign_id)
        .order_by(AdminPushSend.queued_at.desc())
        .limit(50)
        .all()
    )
    return {"campaign": _campaign_item(row), "sends": [_send_item(s) for s in sends]}


def _run_send_job(send_id: int) -> None:
    db = SessionLocal()
    try:
        send_row = db.query(AdminPushSend).filter(AdminPushSend.id == send_id).first()
        if not send_row:
            return
        campaign = db.query(AdminPushCampaign).filter(AdminPushCampaign.id == send_row.campaign_id).first()
        if not campaign or campaign.deleted_at:
            send_row.status = "failed"
            send_row.error_summary = "Campaign missing."
            send_row.finished_at = datetime.utcnow()
            db.commit()
            return

        send_row.status = "sending"
        send_row.started_at = datetime.utcnow()
        db.commit()

        token_query = (
            db.query(PushToken)
            .join(User, User.id == PushToken.user_id)
            .filter(PushToken.provider == "expo", PushToken.enabled.is_(True))
        )

        if campaign.audience == "premium":
            token_query = token_query.filter(User.subscription_tier == "premium")
        elif campaign.audience == "free":
            token_query = token_query.filter(User.subscription_tier != "premium")

        tokens = token_query.order_by(PushToken.id.asc()).all()
        send_row.total_tokens = len(tokens)
        db.commit()

        messages = []
        for t in tokens:
            messages.append(
                {
                    "to": t.token,
                    "sound": "default",
                    "title": campaign.title,
                    "body": campaign.body,
                    "data": {"deeplink": campaign.deeplink} if campaign.deeplink else {},
                }
            )

        result = send_expo_push_messages(messages)
        send_row.success_count = int(result.success_count)
        send_row.failure_count = int(result.failure_count)
        send_row.finished_at = datetime.utcnow()
        send_row.status = "sent" if result.failure_count == 0 else "failed"
        if result.failure_count:
            send_row.error_summary = f"{result.failure_count} deliveries failed."

        db.commit()

        if result.failures:
            for failure in result.failures[:500]:
                token_value = failure.get("to")
                token_row = None
                if token_value:
                    token_row = db.query(PushToken).filter(PushToken.token == token_value).first()
                    # Disable obvious invalid tokens to keep future broadcasts faster.
                    if token_row and isinstance(failure.get("details"), dict):
                        error_code = failure["details"].get("error")
                        if error_code in {"DeviceNotRegistered", "InvalidCredentials"}:
                            token_row.enabled = False
                            token_row.updated_at = datetime.utcnow()
                db.add(
                    AdminPushSendFailure(
                        push_send_id=send_row.id,
                        user_id=getattr(token_row, "user_id", None) if token_row else None,
                        push_token_id=getattr(token_row, "id", None) if token_row else None,
                        token=token_value,
                        error=str(failure.get("error") or "Unknown push failure"),
                        created_at=datetime.utcnow(),
                    )
                )
            db.commit()
    except Exception as exc:  # noqa: BLE001
        try:
            send_row = db.query(AdminPushSend).filter(AdminPushSend.id == send_id).first()
            if send_row:
                send_row.status = "failed"
                send_row.error_summary = f"Send job crashed: {exc}"
                send_row.finished_at = datetime.utcnow()
                db.commit()
        except Exception:  # noqa: BLE001
            pass
    finally:
        db.close()


@router.post("/{campaign_id}/send")
def send_now(
    campaign_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),  # noqa: ARG001
):
    campaign = db.query(AdminPushCampaign).filter(AdminPushCampaign.id == campaign_id, AdminPushCampaign.deleted_at.is_(None)).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    now = datetime.utcnow()
    send_row = AdminPushSend(
        campaign_id=campaign_id,
        provider="expo",
        mode="send_now",
        status="queued",
        queued_at=now,
    )
    db.add(send_row)
    db.commit()
    db.refresh(send_row)
    background_tasks.add_task(_run_send_job, send_row.id)
    return {"status": "queued", "send": _send_item(send_row)}


@router.post("/{campaign_id}/resend")
def resend(
    campaign_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),  # noqa: ARG001
):
    campaign = db.query(AdminPushCampaign).filter(AdminPushCampaign.id == campaign_id, AdminPushCampaign.deleted_at.is_(None)).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    now = datetime.utcnow()
    send_row = AdminPushSend(
        campaign_id=campaign_id,
        provider="expo",
        mode="resend",
        status="queued",
        queued_at=now,
    )
    db.add(send_row)
    db.commit()
    db.refresh(send_row)
    background_tasks.add_task(_run_send_job, send_row.id)
    return {"status": "queued", "send": _send_item(send_row)}


@router.get("/{campaign_id}/failures")
def list_failures(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),  # noqa: ARG001
):
    send = (
        db.query(AdminPushSend)
        .filter(AdminPushSend.campaign_id == campaign_id)
        .order_by(AdminPushSend.queued_at.desc())
        .first()
    )
    if not send:
        raise HTTPException(status_code=404, detail="No sends found.")

    rows = (
        db.query(AdminPushSendFailure)
        .filter(AdminPushSendFailure.push_send_id == send.id)
        .order_by(AdminPushSendFailure.created_at.desc())
        .limit(200)
        .all()
    )
    return {
        "send_id": send.id,
        "items": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "token": r.token,
                "error": r.error,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }
