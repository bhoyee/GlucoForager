from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.user import User
from ..services.subscription_service import get_effective_subscription_tier


TRIAL_EXPIRED_MESSAGE = (
    "Your 7-day free trial has ended. Start Premium to continue using GlucoForager."
)


@dataclass(frozen=True)
class AccessSnapshot:
    allowed: bool
    access_status: str
    is_premium: bool
    trial_active: bool
    trial_ends_at: datetime | None
    trial_grace_active: bool
    trial_grace_ends_at: datetime | None
    trial_days_left: int
    message: str | None = None

    def to_dict(self) -> dict:
        return {
            "allowed": self.allowed,
            "access_status": self.access_status,
            "is_premium": self.is_premium,
            "trial_active": self.trial_active,
            "trial_ends_at": self.trial_ends_at,
            "trial_grace_active": self.trial_grace_active,
            "trial_grace_ends_at": self.trial_grace_ends_at,
            "trial_days_left": self.trial_days_left,
            "message": self.message,
        }


def _ceil_days_left(end: datetime | None, now: datetime) -> int:
    if not end or end <= now:
        return 0
    seconds = (end - now).total_seconds()
    return max(1, int((seconds + 86399) // 86400))


def start_trial_for_new_user(user: User, now: datetime | None = None) -> None:
    now = now or datetime.utcnow()
    if getattr(user, "trial_started_at", None) is None:
        user.trial_started_at = now
    if getattr(user, "trial_ends_at", None) is None:
        days = max(1, int(getattr(settings, "trial_access_days", 7) or 7))
        user.trial_ends_at = now + timedelta(days=days)


def get_access_snapshot(db: Session, user: User, now: datetime | None = None) -> AccessSnapshot:
    now = now or datetime.utcnow()
    tier = get_effective_subscription_tier(db, user, now=now) or "free"
    is_premium = tier == "premium"
    trial_end = getattr(user, "trial_ends_at", None)
    grace_end = getattr(user, "trial_grace_ends_at", None)
    trial_active = bool(trial_end and trial_end > now)
    grace_active = bool(grace_end and grace_end > now)

    if is_premium:
        return AccessSnapshot(
            allowed=True,
            access_status="premium",
            is_premium=True,
            trial_active=trial_active,
            trial_ends_at=trial_end,
            trial_grace_active=grace_active,
            trial_grace_ends_at=grace_end,
            trial_days_left=0,
        )

    if trial_active:
        return AccessSnapshot(
            allowed=True,
            access_status="trial",
            is_premium=False,
            trial_active=True,
            trial_ends_at=trial_end,
            trial_grace_active=False,
            trial_grace_ends_at=grace_end,
            trial_days_left=_ceil_days_left(trial_end, now),
        )

    if grace_active:
        return AccessSnapshot(
            allowed=True,
            access_status="grace",
            is_premium=False,
            trial_active=False,
            trial_ends_at=trial_end,
            trial_grace_active=True,
            trial_grace_ends_at=grace_end,
            trial_days_left=_ceil_days_left(grace_end, now),
        )

    return AccessSnapshot(
        allowed=False,
        access_status="expired",
        is_premium=False,
        trial_active=False,
        trial_ends_at=trial_end,
        trial_grace_active=False,
        trial_grace_ends_at=grace_end,
        trial_days_left=0,
        message=TRIAL_EXPIRED_MESSAGE,
    )


def trial_required_detail(snapshot: AccessSnapshot | None = None) -> dict:
    message = snapshot.message if snapshot and snapshot.message else TRIAL_EXPIRED_MESSAGE
    return {
        "code": "trial_expired",
        "message": message,
        "upgrade": True,
        "access_status": "expired",
    }
