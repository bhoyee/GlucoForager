import time
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.ai_job import AIJob
from ..models.ai_request import AIRequest
from ..services.cache_service import CacheService
from ..services.settings_service import get_ai_guardrail_settings


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    limit_per_minute: int
    used: int
    remaining: int
    retry_after_seconds: int


@dataclass(frozen=True)
class DailyLimitResult:
    allowed: bool
    feature: str
    tier: str
    limit_per_day: int
    used: int
    remaining: int
    upgrade: bool


def _minute_bucket(ts: float | None = None) -> int:
    now = time.time() if ts is None else float(ts)
    return int(now // 60)


def check_ai_rate_limit(*, user_id: int, tier: str, kind: str, db: Session | None = None) -> RateLimitResult:
    """
    Simple per-user burst limiter.

    kind: "text" | "vision" | "vision_batch"
    """
    kind_norm = (kind or "").strip().lower()
    tier_norm = (tier or "").strip().lower()
    guardrails = get_ai_guardrail_settings(db) if db is not None else None

    is_premium = tier_norm == "premium"
    if kind_norm == "text":
        limit = (
            int(guardrails.premium_text_per_minute if guardrails else settings.ai_rate_limit_premium_text_per_min)
            if is_premium
            else int(guardrails.free_text_per_minute if guardrails else settings.ai_rate_limit_free_text_per_min)
        )
    else:
        limit = (
            int(guardrails.premium_vision_per_minute if guardrails else settings.ai_rate_limit_premium_vision_per_min)
            if is_premium
            else int(guardrails.free_vision_per_minute if guardrails else settings.ai_rate_limit_free_vision_per_min)
        )

    # Disable if misconfigured.
    if limit <= 0:
        return RateLimitResult(
            allowed=True,
            limit_per_minute=limit,
            used=0,
            remaining=0,
            retry_after_seconds=0,
        )

    bucket = _minute_bucket()
    key = f"rl:ai:{kind_norm}:{tier_norm}:{int(user_id)}:{bucket}"
    cache = CacheService()
    used = cache.incr(key, ttl_seconds=120)
    remaining = max(0, limit - used)
    allowed = used <= limit
    retry_after = int(60 - (time.time() % 60)) if not allowed else 0
    return RateLimitResult(
        allowed=allowed,
        limit_per_minute=limit,
        used=int(used),
        remaining=int(remaining),
        retry_after_seconds=int(retry_after),
    )


def ai_daily_limit_for_feature(*, tier: str, feature: str, db: Session | None = None) -> int:
    tier_norm = (tier or "free").strip().lower()
    feature_norm = (feature or "").strip().lower()
    is_premium = tier_norm == "premium"
    guardrails = get_ai_guardrail_settings(db) if db is not None else None

    if feature_norm == "agent":
        return int(
            (guardrails.premium_agent_daily if is_premium else guardrails.free_agent_daily)
            if guardrails
            else (settings.ai_daily_limit_premium_agent if is_premium else settings.ai_daily_limit_free_agent)
        )
    if feature_norm == "recipes":
        return int(
            (guardrails.premium_recipes_daily if is_premium else guardrails.free_recipes_daily)
            if guardrails
            else (settings.ai_daily_limit_premium_recipes if is_premium else settings.ai_daily_limit_free_recipes)
        )
    if feature_norm == "swaps":
        return int(
            (guardrails.premium_swaps_daily if is_premium else guardrails.free_swaps_daily)
            if guardrails
            else (settings.ai_daily_limit_premium_swaps if is_premium else settings.ai_daily_limit_free_swaps)
        )
    if feature_norm == "daily_plan" and is_premium:
        return int(guardrails.premium_daily_plan_daily if guardrails else settings.ai_daily_limit_premium_daily_plan)
    return 0


def check_ai_daily_limit(
    db: Session,
    *,
    user_id: int,
    tier: str,
    feature: str,
    request_types: list[str],
    pending_job_source: str | None = None,
) -> DailyLimitResult:
    tier_norm = (tier or "free").strip().lower()
    feature_norm = (feature or "").strip().lower()
    limit = ai_daily_limit_for_feature(tier=tier_norm, feature=feature_norm, db=db)
    if limit <= 0:
        return DailyLimitResult(
            allowed=True,
            feature=feature_norm,
            tier=tier_norm,
            limit_per_day=limit,
            used=0,
            remaining=0,
            upgrade=False,
        )

    now = datetime.utcnow()
    start_of_day = datetime(year=now.year, month=now.month, day=now.day)
    request_count = (
        db.query(AIRequest)
        .filter(
            AIRequest.user_id == int(user_id),
            AIRequest.request_type.in_(request_types or [feature_norm]),
            AIRequest.created_at >= start_of_day,
        )
        .count()
    )
    pending_count = 0
    if pending_job_source:
        pending_count = (
            db.query(AIJob)
            .filter(
                AIJob.user_id == int(user_id),
                AIJob.source == pending_job_source,
                AIJob.status.in_(["pending", "queued", "running"]),
                AIJob.created_at >= start_of_day,
            )
            .count()
        )

    used = int(request_count) + int(pending_count)
    remaining = max(0, limit - used)
    return DailyLimitResult(
        allowed=used < limit,
        feature=feature_norm,
        tier=tier_norm,
        limit_per_day=limit,
        used=used,
        remaining=remaining,
        upgrade=tier_norm != "premium",
    )


def daily_limit_detail(result: DailyLimitResult, *, label: str) -> dict:
    if result.upgrade:
        message = f"Daily {label} limit reached. Upgrade to Premium for more."
    else:
        message = f"Daily {label} limit reached. Please try again tomorrow."
    return {
        "code": "daily_limit_reached",
        "message": message,
        "limit_per_day": result.limit_per_day,
        "used_today": result.used,
        "remaining_today": result.remaining,
        "upgrade": result.upgrade,
    }

