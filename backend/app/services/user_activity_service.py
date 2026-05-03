from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from ..models.user import User
from ..models.user_activity_event import UserActivityEvent

logger = logging.getLogger(__name__)


def touch_user_activity(db: Session, user: User, *, min_interval_seconds: int = 300) -> None:
    """Best-effort last-active update for authenticated app users."""
    try:
        now = datetime.utcnow()
        last_active = getattr(user, "last_active_at", None)
        if last_active and now - last_active < timedelta(seconds=max(60, int(min_interval_seconds))):
            return
        user.last_active_at = now
        db.add(user)
        db.commit()
        logger.info("user_activity.touch.success user_id=%s", getattr(user, "id", None))
    except Exception:
        logger.exception("user_activity.touch.failed user_id=%s", getattr(user, "id", None))
        db.rollback()


def add_user_activity(
    db: Session,
    *,
    user_id: int,
    event_type: str,
    label: str,
    source: str | None = None,
    metadata: dict[str, Any] | None = None,
    commit: bool = False,
) -> None:
    """Add a user activity event without changing endpoint responses."""
    try:
        event = UserActivityEvent(
            user_id=int(user_id),
            event_type=str(event_type or "activity")[:80],
            label=str(label or "Activity")[:180],
            source=str(source)[:80] if source else None,
            metadata_json=metadata or None,
            created_at=datetime.utcnow(),
        )
        db.add(event)
        if commit:
            db.commit()
        logger.info(
            "user_activity.add.success user_id=%s event_type=%s source=%s commit=%s",
            user_id,
            event.event_type,
            event.source,
            commit,
        )
    except Exception:
        logger.exception(
            "user_activity.add.failed user_id=%s event_type=%s source=%s commit=%s",
            user_id,
            event_type,
            source,
            commit,
        )
        if commit:
            db.rollback()
