from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models.user import User
from ..services.subscription_service import (
    get_latest_admin_comp,
    get_latest_billing_subscription,
    get_subscription_access_end,
    get_subscription_access_status,
    is_subscription_active,
)


TRIAL_EXPIRED_MESSAGE = (
    "Start your 7-day free trial with Premium to continue using GlucoForager."
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


def _naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def start_trial_for_new_user(user: User, now: datetime | None = None) -> None:
    # Store-backed trials are granted only after RevenueCat confirms an
    # App Store or Google Play entitlement. This no-op remains for old imports.
    return None


def get_access_snapshot(db: Session, user: User, now: datetime | None = None) -> AccessSnapshot:
    now = _naive_utc(now) or datetime.utcnow()
    billing = get_latest_billing_subscription(db, user.id)
    comp = get_latest_admin_comp(db, user.id)
    return build_access_snapshot(user, billing, comp, now=now)


def build_access_snapshot(user: User, billing, comp, *, now: datetime) -> AccessSnapshot:
    """Same logic as get_access_snapshot, but takes already-fetched billing/comp
    subscriptions instead of querying the DB - lets callers batch-fetch subscriptions
    for many users in one query instead of two extra queries per user (see
    admin.py's _batch_subscriptions_for_users, used by the admin dashboard)."""
    now = _naive_utc(now) or datetime.utcnow()
    billing_access_status = get_subscription_access_status(billing, now=now)
    billing_end = get_subscription_access_end(billing)
    comp_active = is_subscription_active(comp, now=now)
    comp_end = get_subscription_access_end(comp)
    grace_end = _naive_utc(getattr(user, "trial_grace_ends_at", None))
    legacy_grace_active = bool(grace_end and grace_end > now)

    if billing_access_status == "trialing":
        return AccessSnapshot(
            allowed=True,
            access_status="trialing",
            is_premium=True,
            trial_active=True,
            trial_ends_at=billing_end,
            trial_grace_active=False,
            trial_grace_ends_at=grace_end,
            trial_days_left=_ceil_days_left(billing_end, now),
        )

    if billing_access_status == "cancelled_active":
        return AccessSnapshot(
            allowed=True,
            access_status="cancelled_active",
            is_premium=True,
            trial_active=False,
            trial_ends_at=billing_end,
            trial_grace_active=False,
            trial_grace_ends_at=grace_end,
            trial_days_left=_ceil_days_left(billing_end, now),
        )

    if billing_access_status == "premium" or comp_active:
        return AccessSnapshot(
            allowed=True,
            access_status="premium",
            is_premium=True,
            trial_active=False,
            trial_ends_at=billing_end if billing_access_status == "premium" else comp_end,
            trial_grace_active=False,
            trial_grace_ends_at=grace_end,
            trial_days_left=0,
        )

    if legacy_grace_active:
        return AccessSnapshot(
            allowed=True,
            access_status="legacy_grace",
            is_premium=False,
            trial_active=False,
            trial_ends_at=None,
            trial_grace_active=True,
            trial_grace_ends_at=grace_end,
            trial_days_left=_ceil_days_left(grace_end, now),
        )

    return AccessSnapshot(
        allowed=False,
        access_status="expired",
        is_premium=False,
        trial_active=False,
        trial_ends_at=None,
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
