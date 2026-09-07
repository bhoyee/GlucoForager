from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...api.dependencies import get_current_user, require_ai_feature_access
from ...database import get_db
from ...models.user import User
from ...services.ai_vision import AIVisionService
from ...services.cache_service import CacheService
from ...services.cost_tracker import record_ai_request
from ...services.diabetes_food_note import build_diabetes_note
from ...services.subscription_service import get_effective_subscription_tier

router = APIRouter(prefix="/app", tags=["app"])
logger = logging.getLogger(__name__)
vision_service = AIVisionService()
cache = CacheService()

# Kept as simple fixed constants rather than wired into the admin-configurable AI
# guardrail system (like recipes/swaps/agent) - this is a single new premium-gated
# feature, not worth the extra settings/admin-UI plumbing until usage data says
# otherwise.
PHOTO_SCAN_DAILY_LIMIT = 20
PHOTO_SCAN_PER_MINUTE_LIMIT = 6


class PhotoScanPayload(BaseModel):
    image_base64: str = Field(..., min_length=100)


def _num(value) -> float | None:
    return float(value) if isinstance(value, (int, float)) else None


@router.post("/food-scan")
def scan_food_photo(
    payload: PhotoScanPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    device_id: str | None = Header(None, alias="X-Device-Id"),
):
    require_ai_feature_access(current_user, db, device_id)
    tier = get_effective_subscription_tier(db, current_user) or "free"

    minute_key = f"food_scan:rl:v1:user:{current_user.id}"
    if cache.incr(minute_key, ttl_seconds=60) > PHOTO_SCAN_PER_MINUTE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={"code": "rate_limited", "message": "Scanning too fast - wait a moment and try again."},
        )

    day_key = f"food_scan:daily:v1:user:{current_user.id}:{date.today().isoformat()}"
    if cache.incr(day_key, ttl_seconds=90000) > PHOTO_SCAN_DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "daily_limit",
                "message": f"You've reached today's {PHOTO_SCAN_DAILY_LIMIT}-scan limit. Try again tomorrow.",
            },
        )

    result = vision_service.analyze_food_photo(payload.image_base64, tier)
    record_ai_request(
        db,
        current_user.id,
        tier,
        "food_scan",
        model_used=result.get("model_used") or "unknown",
        tokens_used=0,
        cost_estimate=0.0,
        device_id=device_id,
    )

    if not bool(result.get("is_food")):
        return {"is_food": False}

    carbs = _num(result.get("carbs_g"))
    sugars = _num(result.get("sugars_g"))
    fiber = _num(result.get("fiber_g"))
    calories = _num(result.get("calories"))

    diabetes_note = None
    if carbs is not None or sugars is not None:
        diabetes_note = build_diabetes_note(carbs_g=carbs, sugars_g=sugars, fiber_g=fiber)

    return {
        "is_food": True,
        "name": result.get("name"),
        "confidence": result.get("confidence"),
        "carbs_g": round(carbs, 1) if carbs is not None else None,
        "sugars_g": round(sugars, 1) if sugars is not None else None,
        "fiber_g": round(fiber, 1) if fiber is not None else None,
        "net_carbs_g": round(carbs - fiber, 1) if carbs is not None and fiber is not None else None,
        "calories": round(calories) if calories is not None else None,
        "diabetes_note": diabetes_note,
    }
