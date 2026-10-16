"""Weekly free-tier allowances for AI features.

Users without Premium (no store trial/subscription, no admin comp, and outside their
no-card welcome week) can still use each AI feature a few times per week before the
paywall. Weeks start Monday 00:00 UTC. A use is recorded only after the AI call
succeeds, so failures never cost the user a free use.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..models.feature_usage import FeatureUsageWeekly
from ..models.user import User
from .trial_access_service import get_access_snapshot

GLUCOGUIDE = "glucoguide"
INGREDIENT_SCAN = "ingredient_scan"
RECIPE_GENERATION = "recipe_generation"
FOOD_SCAN = "food_scan"
SWAPS = "swaps"

# Defaults only - the live values are admin-editable (settings_service.get_free_tier_settings).
# Features missing from this map (e.g. the daily meal planner) are always Premium-only;
# setting a feature's limit to 0 in admin makes it Premium-only too.
DEFAULT_FREE_WEEKLY_LIMITS: dict[str, int] = {
    GLUCOGUIDE: 3,
    INGREDIENT_SCAN: 3,
    RECIPE_GENERATION: 3,
    FOOD_SCAN: 3,
    SWAPS: 3,
}

FEATURE_LABELS: dict[str, tuple[str, str]] = {
    # feature: (singular, plural) as shown to users
    GLUCOGUIDE: ("GlucoGuide question", "GlucoGuide questions"),
    INGREDIENT_SCAN: ("ingredient scan", "ingredient scans"),
    RECIPE_GENERATION: ("recipe generation", "recipe generations"),
    FOOD_SCAN: ("food scan", "food scans"),
    SWAPS: ("food swap search", "food swap searches"),
}

DEFAULT_WELCOME_WEEK_DAYS = 7


def weekly_limits(db: Session | None) -> dict[str, int]:
    if db is None:
        return dict(DEFAULT_FREE_WEEKLY_LIMITS)
    from .settings_service import get_free_tier_settings

    return get_free_tier_settings(db).weekly_limits


def limit_for(db: Session | None, feature: str) -> int:
    return int(weekly_limits(db).get(feature, 0))


def week_start(now: datetime | None = None) -> date:
    today = (now or datetime.utcnow()).date()
    return today - timedelta(days=today.weekday())


def week_resets_at(now: datetime | None = None) -> datetime:
    start = week_start(now)
    return datetime.combine(start + timedelta(days=7), datetime.min.time())


def get_used(db: Session, user_id: int, feature: str, now: datetime | None = None) -> int:
    used = (
        db.query(FeatureUsageWeekly.used)
        .filter(
            FeatureUsageWeekly.user_id == user_id,
            FeatureUsageWeekly.feature == feature,
            FeatureUsageWeekly.week_start == week_start(now),
        )
        .scalar()
    )
    return int(used or 0)


def get_remaining(db: Session, user_id: int, feature: str, now: datetime | None = None) -> int:
    limit = limit_for(db, feature)
    if limit <= 0:
        return 0
    return max(0, limit - get_used(db, user_id, feature, now))


def usage_summary(db: Session, user_id: int, now: datetime | None = None) -> dict:
    rows = (
        db.query(FeatureUsageWeekly.feature, FeatureUsageWeekly.used)
        .filter(FeatureUsageWeekly.user_id == user_id, FeatureUsageWeekly.week_start == week_start(now))
        .all()
    )
    used_by_feature = {feature: int(used or 0) for feature, used in rows}
    return {
        "resets_at": week_resets_at(now),
        "features": {
            feature: {
                "limit": limit,
                "used": min(limit, used_by_feature.get(feature, 0)),
                "remaining": max(0, limit - used_by_feature.get(feature, 0)),
            }
            for feature, limit in weekly_limits(db).items()
        },
    }


def record_use(db: Session, user_id: int, feature: str, now: datetime | None = None) -> None:
    """Atomically add one use for this week. Commits."""
    stmt = pg_insert(FeatureUsageWeekly).values(
        user_id=user_id,
        feature=feature,
        week_start=week_start(now),
        used=1,
        updated_at=datetime.utcnow(),
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_feature_usage_user_feature_week",
        set_={"used": FeatureUsageWeekly.used + 1, "updated_at": func.now()},
    )
    db.execute(stmt)
    db.commit()


def record_use_if_free(db: Session, user: User | int, feature: str | None) -> None:
    """Count a successful AI use against the weekly allowance, but only for users
    without Premium/trial/welcome access (whose usage is unlimited and uncounted)."""
    if not feature or feature not in DEFAULT_FREE_WEEKLY_LIMITS:
        return
    if isinstance(user, int):
        user = db.query(User).filter(User.id == user).first()
        if not user:
            return
    if get_access_snapshot(db, user).allowed:
        return
    record_use(db, user.id, feature)


def free_limit_detail(feature: str, now: datetime | None = None, db: Session | None = None) -> dict:
    limit = limit_for(db, feature)
    singular, plural = FEATURE_LABELS.get(feature, ("use", "uses"))
    if limit:
        message = (
            f"You've used your {limit} free {plural if limit != 1 else singular} this week. "
            "Upgrade to Premium for unlimited access, or come back on Monday for more free uses."
        )
    else:
        message = "This feature is part of GlucoForager Premium. Upgrade to unlock it."
    return {
        "code": "free_limit_reached" if limit else "premium_feature",
        "message": message,
        "upgrade": True,
        "access_status": "expired",
        "feature": feature,
        "limit": limit,
        "remaining": 0,
        "resets_at": week_resets_at(now).isoformat() + "Z",
    }


def start_welcome_week(user: User, now: datetime | None = None, *, days: int = DEFAULT_WELCOME_WEEK_DAYS) -> None:
    """Give a user the no-card welcome week (uses the trial_grace_ends_at window).
    Never shortens an existing, longer window. days=0 skips it. Caller commits."""
    if days <= 0:
        return
    end = (now or datetime.utcnow()) + timedelta(days=days)
    current = user.trial_grace_ends_at
    if current is None or current < end:
        user.trial_grace_ends_at = end
