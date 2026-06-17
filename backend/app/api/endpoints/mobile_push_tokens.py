from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..dependencies import get_current_user
from ...database import get_db
from ...models.push_token import PushToken
from ...services.user_activity_service import add_user_activity


router = APIRouter(prefix="/mobile/push-tokens", tags=["mobile-push-tokens"])


class PushTokenUpsertPayload(BaseModel):
    provider: str = Field("expo", max_length=32)
    platform: str | None = Field(None, max_length=32)
    token: str = Field(..., max_length=256)
    enabled: bool = True


def _validate_expo_token(raw: str) -> str:
    token = raw.strip()
    # Expo tokens are usually "ExponentPushToken[...]" or "ExpoPushToken[...]" depending on SDK.
    if not token:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Missing push token.")
    if len(token) < 10:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid push token.")
    return token


@router.put("")
def upsert_push_token(
    payload: PushTokenUpsertPayload,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    provider = (payload.provider or "expo").strip().lower()
    if provider != "expo":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported provider.")

    token = _validate_expo_token(payload.token)
    platform = payload.platform.strip().lower() if isinstance(payload.platform, str) and payload.platform.strip() else None

    now = datetime.utcnow()
    row = db.query(PushToken).filter(PushToken.token == token).first()
    if not row:
        row = PushToken(
            user_id=user.id,
            provider=provider,
            platform=platform,
            token=token,
            enabled=bool(payload.enabled),
            created_at=now,
            updated_at=now,
            last_seen_at=now,
        )
        db.add(row)
    else:
        row.user_id = user.id
        row.provider = provider
        row.platform = platform
        row.enabled = bool(payload.enabled)
        row.updated_at = now
        row.last_seen_at = now

    add_user_activity(
        db,
        user_id=user.id,
        event_type="push_token.updated",
        label="Updated notification token",
        source="mobile",
        metadata={"platform": platform, "enabled": bool(payload.enabled)},
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        row = db.query(PushToken).filter(PushToken.token == token).first()
        if not row:
            raise
        row.user_id = user.id
        row.provider = provider
        row.platform = platform
        row.enabled = bool(payload.enabled)
        row.updated_at = now
        row.last_seen_at = now
        add_user_activity(
            db,
            user_id=user.id,
            event_type="push_token.updated",
            label="Updated notification token",
            source="mobile",
            metadata={"platform": platform, "enabled": bool(payload.enabled), "retry": True},
        )
        db.commit()
    return {"status": "ok", "enabled": row.enabled}


class PushDisablePayload(BaseModel):
    provider: str = Field("expo", max_length=32)


@router.post("/disable")
def disable_push_tokens(
    payload: PushDisablePayload,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    provider = (payload.provider or "expo").strip().lower()
    if provider != "expo":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported provider.")

    now = datetime.utcnow()
    updated = (
        db.query(PushToken)
        .filter(PushToken.user_id == user.id, PushToken.provider == provider, PushToken.enabled.is_(True))
        .update({"enabled": False, "updated_at": now}, synchronize_session=False)
    )
    db.commit()
    return {"status": "ok", "disabled": int(updated or 0)}

