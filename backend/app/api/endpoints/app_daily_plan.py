from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
import logging

from ...api.dependencies import get_current_user
from ...database import get_db
from ...models.ai_request import AIRequest
from ...models.meal_plan import MealPlan
from ...models.user import User
from ...services.cache_service import CacheService
from ...services.cost_tracker import record_ai_request
from ...services.daily_plan_service import DailyPlanService
from ...services.food_profile_service import extract_food_profile, build_food_profile_instructions
from ...services.subscription_service import get_effective_subscription_tier
from ...services.recipe_image_attach_service import attach_recipe_images

router = APIRouter(prefix="/app/daily-plan", tags=["daily-plan"])
logger = logging.getLogger(__name__)


def _require_premium(db: Session, user: User) -> None:
    tier = get_effective_subscription_tier(db, user) or "free"
    if tier != "premium":
        raise HTTPException(status_code=403, detail="Premium required")


def _decode_plan_payload(recipes_value):
    if isinstance(recipes_value, dict):
        meals = recipes_value.get("meals") if isinstance(recipes_value.get("meals"), list) else []
        return {
            "meals": meals,
            "summary": recipes_value.get("summary") if isinstance(recipes_value.get("summary"), str) else None,
            "daily_nutrition_estimate": recipes_value.get("daily_nutrition_estimate")
            if isinstance(recipes_value.get("daily_nutrition_estimate"), dict)
            else None,
        }
    if isinstance(recipes_value, list):
        return {"meals": recipes_value, "summary": None, "daily_nutrition_estimate": None}
    return {"meals": [], "summary": None, "daily_nutrition_estimate": None}


@router.get("/today")
def get_today_plan(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = datetime.utcnow().date()
    plan = (
        db.query(MealPlan)
        .filter(MealPlan.user_id == current_user.id, MealPlan.plan_date == today)
        .order_by(MealPlan.id.desc())
        .first()
    )
    if not plan:
        return {"plan": None}

    decoded = _decode_plan_payload(plan.recipes)
    return {
        "plan": {
            "id": plan.id,
            "plan_date": plan.plan_date.isoformat(),
            "meals": decoded["meals"],
            "summary": decoded["summary"],
            "daily_nutrition_estimate": decoded["daily_nutrition_estimate"],
        }
    }


@router.post("/generate")
def generate_today_plan(
    request: Request,
    force: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tier = get_effective_subscription_tier(db, current_user) or "free"
    today = datetime.utcnow().date()

    existing = (
        db.query(MealPlan)
        .filter(MealPlan.user_id == current_user.id, MealPlan.plan_date == today)
        .order_by(MealPlan.id.desc())
        .first()
    )
    if existing and (not force):
        decoded = _decode_plan_payload(existing.recipes)
        return {
            "plan": {
                "id": existing.id,
                "plan_date": existing.plan_date.isoformat(),
                "meals": decoded["meals"],
                "summary": decoded["summary"],
                "daily_nutrition_estimate": decoded["daily_nutrition_estimate"],
            }
        }

    # Rate limit: protect costs/latency for all tiers.
    per_minute_limit = 2
    premium_per_day_limit = 6
    free_per_week_limit = 1

    cache = CacheService()
    minute_key = f"daily_plan:rl:v1:user:{current_user.id}"
    minute_count = cache.incr(minute_key, ttl_seconds=60)
    if minute_count > per_minute_limit:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "rate_limited",
                "message": "You're generating too fast. Please wait a moment and try again.",
                "limit_per_minute": per_minute_limit,
            },
        )

    now = datetime.utcnow()
    if tier != "premium":
        window_start = now - timedelta(days=7)
        used_recent = (
            db.query(AIRequest)
            .filter(
                AIRequest.user_id == current_user.id,
                AIRequest.request_type == "daily_plan",
                AIRequest.created_at >= window_start,
            )
            .count()
        )
        if used_recent >= free_per_week_limit:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "weekly_limit_reached",
                    "message": "Free plan includes 1 meal plan per week. Upgrade to Premium for more.",
                    "limit_per_week": free_per_week_limit,
                },
            )
    else:
        start_of_day = datetime(year=now.year, month=now.month, day=now.day)
        used_today = (
            db.query(AIRequest)
            .filter(
                AIRequest.user_id == current_user.id,
                AIRequest.request_type == "daily_plan",
                AIRequest.created_at >= start_of_day,
            )
            .count()
        )
        if used_today >= premium_per_day_limit:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "daily_limit_reached",
                    "message": "Daily Meal Planner limit reached. Please try again tomorrow.",
                    "limit_per_day": premium_per_day_limit,
                },
            )

    profile = extract_food_profile(current_user)
    profile_text = build_food_profile_instructions(profile, strength="strong", mode="quick", has_ingredients=False)
    service = DailyPlanService()

    # Avoid repeating yesterday/previous plans for credibility.
    avoid_titles: list[str] = []
    try:
        recent_plans = (
            db.query(MealPlan)
            .filter(MealPlan.user_id == current_user.id, MealPlan.plan_date < today)
            .order_by(MealPlan.plan_date.desc(), MealPlan.id.desc())
            .limit(3)
            .all()
        )
        for p in recent_plans or []:
            decoded = _decode_plan_payload(p.recipes)
            for meal in decoded.get("meals") or []:
                if not isinstance(meal, dict):
                    continue
                title = meal.get("title") or meal.get("name")
                if isinstance(title, str) and title.strip():
                    avoid_titles.append(title.strip())
    except Exception:
        avoid_titles = []
    try:
        generated = service.generate(
            plan_date=today,
            profile_instructions=profile_text,
            avoid_titles=avoid_titles,
            # Force-regenerate should produce variety (seed changes each request).
            variation_seed=None if not force else datetime.utcnow().isoformat(),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        logger.warning("Daily plan generation invalid output user_id=%s: %s", current_user.id, str(exc))
        try:
            device_id = request.headers.get("x-device-id")
            record_ai_request(
                db,
                user_id=current_user.id,
                tier=tier,
                request_type="daily_plan",
                model_used="failed",
                tokens_used=0,
                cost_estimate=0.0,
                device_id=device_id,
            )
            db.commit()
        except Exception:
            pass
        raise HTTPException(status_code=502, detail="Could not generate plan. Please try again.") from exc
    except Exception:
        logger.exception("Daily plan generation failed user_id=%s", current_user.id)
        try:
            device_id = request.headers.get("x-device-id")
            record_ai_request(
                db,
                user_id=current_user.id,
                tier=tier,
                request_type="daily_plan",
                model_used="failed",
                tokens_used=0,
                cost_estimate=0.0,
                device_id=device_id,
            )
            db.commit()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Could not generate plan. Please try again.") from None

    meals = generated.get("meals") or []
    if not isinstance(meals, list) or not meals:
        raise HTTPException(status_code=500, detail="Invalid plan output. Please try again.")

    try:
        attach_recipe_images(
            db,
            user=current_user,
            recipes=[m for m in meals if isinstance(m, dict)],
            ingredients=[],
            base_url=str(request.base_url).rstrip("/"),
            # Daily plan generation endpoint is synchronous; keep image generation bounded for latency.
            max_generate=4,
        )
    except Exception:
        pass

    payload_to_store = {
        "meals": meals,
        "summary": generated.get("summary") if isinstance(generated.get("summary"), str) else "",
        "daily_nutrition_estimate": generated.get("daily_nutrition_estimate")
        if isinstance(generated.get("daily_nutrition_estimate"), dict)
        else None,
        "provider": generated.get("provider"),
        "model": generated.get("model"),
    }

    try:
        device_id = request.headers.get("x-device-id")
        record_ai_request(
            db,
            user_id=current_user.id,
            tier=tier,
            request_type="daily_plan",
            model_used=str(generated.get("model") or "unknown"),
            tokens_used=0,
            cost_estimate=0.0,
            device_id=device_id,
        )
    except Exception:
        pass

    if existing:
        existing.recipes = payload_to_store
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return {
            "plan": {
                "id": existing.id,
                "plan_date": existing.plan_date.isoformat(),
                "meals": meals,
                "summary": payload_to_store.get("summary") or None,
                "daily_nutrition_estimate": payload_to_store.get("daily_nutrition_estimate"),
            }
        }

    plan = MealPlan(user_id=current_user.id, plan_date=today, recipes=payload_to_store)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return {
        "plan": {
            "id": plan.id,
            "plan_date": plan.plan_date.isoformat(),
            "meals": meals,
            "summary": payload_to_store.get("summary") or None,
            "daily_nutrition_estimate": payload_to_store.get("daily_nutrition_estimate"),
        }
    }
