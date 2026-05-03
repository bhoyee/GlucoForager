from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_user import StaffUser
from ...models.user import User
from ...models.user_activity_event import UserActivityEvent


router = APIRouter(prefix="/admin/user-activity", tags=["admin-user-activity"])
logger = logging.getLogger(__name__)


def _utc_iso(value):
    if not value:
        return None
    raw = value.isoformat()
    if raw.endswith("Z") or "+" in raw[10:] or "-" in raw[10:]:
        return raw
    return f"{raw}Z"


def _is_recipe_image_ai_event(event: UserActivityEvent) -> bool:
    metadata = event.metadata_json or {}
    return (
        event.event_type == "ai.request"
        and isinstance(metadata, dict)
        and metadata.get("request_type") == "recipe_image"
    )


def _dedupe_feed_rows(rows: list[tuple[UserActivityEvent, User]], limit_value: int) -> list[tuple[UserActivityEvent, User]]:
    collapsed: list[tuple[UserActivityEvent, User]] = []
    recent_recipe_image_by_user: dict[int, object] = {}

    for event, user in rows:
        if _is_recipe_image_ai_event(event):
            previous_time = recent_recipe_image_by_user.get(event.user_id)
            if previous_time and event.created_at and abs((previous_time - event.created_at).total_seconds()) <= 120:
                continue
            recent_recipe_image_by_user[event.user_id] = event.created_at

        collapsed.append((event, user))
        if len(collapsed) >= limit_value:
            break

    return collapsed


def _dedupe_all_rows(rows: list[tuple[UserActivityEvent, User]]) -> list[tuple[UserActivityEvent, User]]:
    collapsed: list[tuple[UserActivityEvent, User]] = []
    recent_recipe_image_by_user: dict[int, object] = {}

    for event, user in rows:
        if _is_recipe_image_ai_event(event):
            previous_time = recent_recipe_image_by_user.get(event.user_id)
            if previous_time and event.created_at and abs((previous_time - event.created_at).total_seconds()) <= 120:
                continue
            recent_recipe_image_by_user[event.user_id] = event.created_at
        collapsed.append((event, user))

    return collapsed


def _serialize_activity(event: UserActivityEvent, user: User) -> dict:
    return {
        "id": event.id,
        "user_id": event.user_id,
        "user_email": user.email,
        "user_name": user.full_name,
        "event_type": event.event_type,
        "label": event.label,
        "source": event.source,
        "metadata": event.metadata_json or {},
        "created_at": _utc_iso(event.created_at),
        "last_active_at": _utc_iso(getattr(user, "last_active_at", None)),
    }


@router.get("/recent")
def recent_user_activity(
    limit: int = 25,
    user_id: int | None = None,
    event_type: str | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("users.read")),  # noqa: ARG001
):
    limit_value = max(1, min(100, int(limit or 25)))
    query = db.query(UserActivityEvent, User).join(User, User.id == UserActivityEvent.user_id)

    if user_id is not None:
        query = query.filter(UserActivityEvent.user_id == int(user_id))
    if event_type:
        query = query.filter(UserActivityEvent.event_type == str(event_type).strip())

    rows = (
        query.order_by(UserActivityEvent.created_at.desc(), UserActivityEvent.id.desc())
        .limit(limit_value * 5)
        .all()
    )
    rows = _dedupe_feed_rows(rows, limit_value)
    logger.info(
        "admin_user_activity.recent limit=%s user_id=%s event_type=%s rows=%s",
        limit_value,
        user_id,
        event_type,
        len(rows),
    )

    return {
        "items": [_serialize_activity(event, user) for event, user in rows],
        "limit": limit_value,
    }


@router.get("")
def list_user_activity(
    page: int = 1,
    page_size: int = 25,
    q: str | None = None,
    user_id: int | None = None,
    event_type: str | None = None,
    source: str | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("users.read")),  # noqa: ARG001
):
    page_value = max(1, int(page or 1))
    page_size_value = max(1, min(100, int(page_size or 25)))
    query = db.query(UserActivityEvent, User).join(User, User.id == UserActivityEvent.user_id)

    if user_id is not None:
        query = query.filter(UserActivityEvent.user_id == int(user_id))
    if event_type:
        query = query.filter(UserActivityEvent.event_type == str(event_type).strip())
    if source:
        query = query.filter(UserActivityEvent.source == str(source).strip())
    if q and q.strip():
        needle = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.email.ilike(needle),
                User.full_name.ilike(needle),
                UserActivityEvent.label.ilike(needle),
                UserActivityEvent.event_type.ilike(needle),
            )
        )

    raw_rows = (
        query.order_by(UserActivityEvent.created_at.desc(), UserActivityEvent.id.desc())
        .limit(1000)
        .all()
    )
    rows = _dedupe_all_rows(raw_rows)
    total = len(rows)
    page_rows = rows[(page_value - 1) * page_size_value : page_value * page_size_value]

    return {
        "items": [_serialize_activity(event, user) for event, user in page_rows],
        "page": page_value,
        "page_size": page_size_value,
        "total": total,
    }
