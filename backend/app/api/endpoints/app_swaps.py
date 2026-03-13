import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...api.dependencies import get_current_user
from ...database import get_db
from ...models.ai_request import AIRequest
from ...models.user import User
from ...services.ai_swaps_service import AISwapsService
from ...services.cache_service import CacheService
from ...services.cost_tracker import record_ai_request
from ...services.subscription_service import get_effective_subscription_tier


router = APIRouter(prefix="/app", tags=["app"])


class SwapsRequest(BaseModel):
    food: str = Field(..., min_length=1, max_length=25)
    force_swaps: bool = False


def _normalize_food_input(value: str) -> str:
    s = " ".join((value or "").strip().split())
    return s[:25]


def _looks_like_food_query(value: str) -> bool:
    """Cheap validation to avoid calling AI on unrelated input."""
    s = _normalize_food_input(value)
    if not s:
        return False
    lowered = s.lower()
    if "http://" in lowered or "https://" in lowered or "www." in lowered:
        return False
    # Avoid long questions/sentences. Encourage single food/drink.
    if "?" in s or "\n" in s or "\r" in s:
        return False
    words = [w for w in s.split(" ") if w]
    if len(words) > 6:
        return False
    # Reject if it's mostly non-alphanumeric.
    alnum = sum(1 for ch in s if ch.isalnum())
    if alnum < max(3, int(len(s) * 0.35)):
        return False
    return True


@router.post("/swaps")
def generate_food_swaps(
    payload: SwapsRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    food = _normalize_food_input(payload.food)
    if not _looks_like_food_query(food):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_food_input",
                "message": "Enter a single food or drink (e.g. 'rice', 'spinach', 'soda').",
            },
        )

    tier = get_effective_subscription_tier(db, user)
    per_minute_limit = 3 if tier != "premium" else 8
    per_day_limit = 10 if tier != "premium" else 50

    cache = CacheService()
    # Burst limit (per minute).
    minute_key = f"swaps:rl:v1:user:{user.id}"
    minute_count = cache.incr(minute_key, ttl_seconds=60)
    if minute_count > per_minute_limit:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "rate_limited",
                "message": "You're searching too fast. Please wait a moment and try again.",
                "limit_per_minute": per_minute_limit,
            },
        )

    # Daily quota (UTC-ish; uses server UTC time).
    now = datetime.utcnow()
    start_of_day = datetime(year=now.year, month=now.month, day=now.day)
    used_today = (
        db.query(AIRequest)
        .filter(
            AIRequest.user_id == user.id,
            AIRequest.request_type == "swaps",
            AIRequest.created_at >= start_of_day,
        )
        .count()
    )
    if used_today >= per_day_limit:
        if tier != "premium":
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "daily_limit_reached",
                    "message": "Daily Food swaps limit reached. Upgrade to Premium for more.",
                    "limit_per_day": per_day_limit,
                    "upgrade": True,
                },
            )
        raise HTTPException(
            status_code=429,
            detail={
                "code": "daily_limit_reached",
                "message": "Daily Food swaps limit reached. Please try again tomorrow.",
                "limit_per_day": per_day_limit,
                "upgrade": False,
            },
        )

    # Cache identical requests (shared by tier + food + force flag).
    cache_key = f"swaps:cache:v1:tier:{tier}:force:{int(bool(payload.force_swaps))}:q:{food.lower()}"
    cached = cache.get(cache_key)
    if cached:
        try:
            data = json.loads(cached)
            device_id = request.headers.get("x-device-id")
            # Cached responses still count towards quota to prevent abuse.
            record_ai_request(
                db,
                user_id=user.id,
                tier=tier,
                request_type="swaps",
                model_used="cache",
                tokens_used=0,
                cost_estimate=0.0,
                device_id=device_id,
            )
            return data
        except Exception:
            pass

    try:
        service = AISwapsService()
        result = service.generate_swaps(food=food, force_swaps=bool(payload.force_swaps), timeout_seconds=12.0)
        assessment = result.get("assessment") or {}
        if not isinstance(assessment, dict):
            raise HTTPException(status_code=502, detail="Swaps generation failed")
        is_food_or_drink = bool(assessment.get("is_food_or_drink", True))
        confidence = 1.0
        try:
            confidence = float(assessment.get("confidence", 1.0))
        except Exception:
            confidence = 1.0
        if not is_food_or_drink or confidence < 0.65:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "not_food_or_drink",
                    "message": "Please enter a food or drink (e.g. 'rice', 'spinach', 'soda').",
                },
            )

        device_id = request.headers.get("x-device-id")
        record_ai_request(
            db,
            user_id=user.id,
            tier=tier,
            request_type="swaps",
            model_used=str(result.get("model") or "unknown"),
            tokens_used=0,
            cost_estimate=0.0,
            device_id=device_id,
        )

        # Do not expose model/provider in the app response.
        response_payload = {
            "food": result.get("food"),
            "assessment": result.get("assessment"),
            "should_show_swaps": result.get("should_show_swaps"),
            "swaps": result.get("swaps"),
        }
        cache.set(cache_key, json.dumps(response_payload, ensure_ascii=False), ttl_seconds=6 * 60 * 60)
        return response_payload
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception:
        raise HTTPException(status_code=502, detail="Swaps generation failed")
