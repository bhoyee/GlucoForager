from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..dependencies import get_current_user
from ...database import get_db
from ...models.user import User
from ...services.user_activity_service import add_user_activity


router = APIRouter(prefix="/mobile/activity", tags=["mobile-activity"])


class MobileActivityPayload(BaseModel):
    event_type: str = Field(..., min_length=2, max_length=80)
    label: str = Field(..., min_length=2, max_length=180)
    source: str | None = Field("mobile", max_length=80)
    metadata: dict | None = None


@router.post("")
def record_mobile_activity(
    payload: MobileActivityPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type=payload.event_type,
        label=payload.label,
        source=payload.source or "mobile",
        metadata=payload.metadata if isinstance(payload.metadata, dict) else None,
    )
    db.commit()
    return {"status": "ok"}
