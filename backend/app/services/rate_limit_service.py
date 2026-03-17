import time
from dataclasses import dataclass

from ..core.config import settings
from ..services.cache_service import CacheService


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    limit_per_minute: int
    used: int
    remaining: int
    retry_after_seconds: int


def _minute_bucket(ts: float | None = None) -> int:
    now = time.time() if ts is None else float(ts)
    return int(now // 60)


def check_ai_rate_limit(*, user_id: int, tier: str, kind: str) -> RateLimitResult:
    """
    Simple per-user burst limiter.

    kind: "text" | "vision" | "vision_batch"
    """
    kind_norm = (kind or "").strip().lower()
    tier_norm = (tier or "").strip().lower()

    is_premium = tier_norm == "premium"
    if kind_norm == "text":
        limit = (
            int(settings.ai_rate_limit_premium_text_per_min)
            if is_premium
            else int(settings.ai_rate_limit_free_text_per_min)
        )
    else:
        limit = (
            int(settings.ai_rate_limit_premium_vision_per_min)
            if is_premium
            else int(settings.ai_rate_limit_free_vision_per_min)
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

