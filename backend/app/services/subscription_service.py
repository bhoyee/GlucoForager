from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models.subscription import Subscription
from ..models.user import User


def is_subscription_active(subscription: Subscription | None, now: datetime | None = None) -> bool:
    if not subscription:
        return False
    now = now or datetime.utcnow()
    if subscription.status != "active":
        return False
    if subscription.expires_at is None:
        return True
    return subscription.expires_at > now


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

