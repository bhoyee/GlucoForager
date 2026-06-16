from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models.subscription import Subscription
from ..models.user import User


ACCESS_STATUSES = {"active", "trialing"}
CANCELLED_ACCESS_STATUSES = {"cancelled", "canceled"}


def _naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def is_subscription_active(subscription: Subscription | None, now: datetime | None = None) -> bool:
    if not subscription:
        return False
    now = _naive_utc(now) or datetime.utcnow()
    status = (subscription.status or "").lower()
    expires_at = _naive_utc(subscription.expires_at)
    if status in ACCESS_STATUSES:
        if expires_at is None:
            return True
        return expires_at > now
    if status in CANCELLED_ACCESS_STATUSES:
        return bool(expires_at and expires_at > now)
    return False


def get_subscription_access_status(subscription: Subscription | None, now: datetime | None = None) -> str | None:
    if not is_subscription_active(subscription, now=now):
        return None
    status = (subscription.status or "").lower()
    if status == "trialing":
        return "trialing"
    if status in CANCELLED_ACCESS_STATUSES:
        return "cancelled_active"
    return "premium"


def get_subscription_access_end(subscription: Subscription | None) -> datetime | None:
    return _naive_utc(getattr(subscription, "expires_at", None))


def is_store_subscription(subscription: Subscription | None) -> bool:
    if not subscription:
        return False
    return (subscription.store or "").lower() != "admin"


def is_premium_blocked(user: User, now: datetime | None = None) -> bool:
    blocked_at = getattr(user, "premium_access_blocked_at", None)
    if not blocked_at:
        return False
    now = now or datetime.utcnow()
    blocked_until = getattr(user, "premium_access_blocked_until", None)
    if blocked_until is None:
        return True
    return blocked_until > now


def get_latest_billing_subscription(db: Session, user_id: int) -> Subscription | None:
    return (
        db.query(Subscription)
        .filter(Subscription.user_id == user_id, Subscription.store != "admin")
        .order_by(Subscription.started_at.desc())
        .first()
    )


def get_latest_admin_comp(db: Session, user_id: int) -> Subscription | None:
    return (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user_id,
            Subscription.store == "admin",
            Subscription.plan == "premium",
        )
        .order_by(Subscription.started_at.desc())
        .first()
    )


def get_effective_subscription_tier(db: Session, user: User, now: datetime | None = None) -> str:
    now = now or datetime.utcnow()

    if is_premium_blocked(user, now=now):
        return "free"

    billing = get_latest_billing_subscription(db, user.id)
    if is_subscription_active(billing, now=now):
        return "premium"

    comp = get_latest_admin_comp(db, user.id)
    if is_subscription_active(comp, now=now):
        return "premium"

    return "free"


def refresh_user_tier(db: Session, user: User, now: datetime | None = None) -> str:
    tier = get_effective_subscription_tier(db, user, now=now)
    user.subscription_tier = tier
    db.add(user)
    return tier

