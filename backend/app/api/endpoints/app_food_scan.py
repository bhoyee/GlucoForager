from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...api.dependencies import get_current_user, require_ai_feature_access
from ...services import free_tier_service
from ...database import get_db
from ...models.user import User
from ...services.ai_vision import AIVisionService
from ...services.analytics_service import track_event
from ...services.cache_service import CacheService
from ...services.cost_tracker import record_ai_request
from ...services.diabetes_food_note import build_diabetes_note
from ...services import food_label, glucose_impact
from .app_health_log import _carb_goal_for_user
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
    require_ai_feature_access(current_user, db, device_id, feature=free_tier_service.FOOD_SCAN)
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
        track_event(current_user.public_id, "photo_scan_verdict", {"tier": tier, "is_food": False})
        return {"is_food": False}

    carbs = _num(result.get("carbs_g"))
    sugars = _num(result.get("sugars_g"))
    fiber = _num(result.get("fiber_g"))
    calories = _num(result.get("calories"))

    # Only recognised food counts against the free allowance.
    free_tier_service.record_use_if_free(db, current_user, free_tier_service.FOOD_SCAN)
    diabetes_note = build_diabetes_note(carbs_g=carbs, sugars_g=sugars, fiber_g=fiber)
    track_event(
        current_user.public_id,
        "photo_scan_verdict",
        {"tier": tier, "is_food": True, "verdict": diabetes_note.get("verdict")},
    )

    protein = _num(result.get("protein_g"))
    fat = _num(result.get("fat_g"))
    items = []
    for item in (result.get("items") or [])[:5] if isinstance(result.get("items"), list) else []:
        if isinstance(item, dict) and item.get("name") and _num(item.get("carbs_g")) is not None:
            items.append({"name": str(item["name"])[:40], "carbs_g": round(_num(item["carbs_g"]))})
    per_serving = {"carbs_g": round(carbs, 1) if carbs is not None else None, "sugars_g": sugars, "fiber_g": fiber}
    carb_goal_g, goal_mode = _carb_goal_for_user(current_user)
    meal_share = food_label.meal_share(per_serving["carbs_g"], carb_goal_g, goal_mode)
    insights = food_label.build_insights(
        per_serving=per_serving, per_100g={}, lights=[], fibre=None, nova_group=None,
        share=meal_share, serving_size=result.get("portion"),
    )
    tip = result.get("tip")
    if isinstance(tip, str) and tip.strip():
        insights.append({"tone": "info", "text": tip.strip()[:180]})

    return {
        "is_food": True,
        "name": result.get("name"),
        "confidence": result.get("confidence"),
        "portion": (result.get("portion") or None) if isinstance(result.get("portion"), str) else None,
        # Packaged products have an exact label: the app suggests scanning the barcode instead.
        "is_packaged": bool(result.get("is_packaged")),
        "carbs_g": round(carbs, 1) if carbs is not None else None,
        "sugars_g": round(sugars, 1) if sugars is not None else None,
        "fiber_g": round(fiber, 1) if fiber is not None else None,
        "net_carbs_g": round(carbs - fiber, 1) if carbs is not None and fiber is not None else None,
        "protein_g": round(protein, 1) if protein is not None else None,
        "fat_g": round(fat, 1) if fat is not None else None,
        "calories": round(calories) if calories is not None else None,
        "items": items,
        "glucose_impact": glucose_impact.estimate_impact(
            carbs_g=carbs, fiber_g=fiber, protein_g=protein, fat_g=fat, sugars_g=sugars,
        ),
        "last_time": glucose_impact.last_actual_reading(db, current_user, result.get("name")),
        "meal_share": meal_share,
        "insights": insights[:4],
        "diabetes_note": diabetes_note,
    }
