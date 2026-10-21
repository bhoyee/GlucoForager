import re
from ...services import glucose_impact
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
import logging

from ...api.dependencies import get_current_user, require_ai_feature_access
from ...database import SessionLocal, get_db
from ...models.ai_request import AIRequest
from ...models.meal_log_entry import MealLogEntry
from ...models.meal_plan import MealPlan
from ...models.user import User
from ...services.cache_service import CacheService
from ...services.cost_tracker import record_ai_request
from ...services.daily_plan_service import DailyPlanService
from ...services.food_profile_service import extract_food_profile, build_food_profile_instructions
from ...services.subscription_service import get_effective_subscription_tier
from ...services.trial_access_service import get_access_snapshot
from ...services.user_activity_service import add_user_activity
from ...services.recipe_image_attach_service import attach_recipe_images
from ...services.system_log_service import log_system_event
from ...services.settings_service import get_ai_guardrail_settings

router = APIRouter(prefix="/app/daily-plan", tags=["daily-plan"])
logger = logging.getLogger(__name__)


def _refresh_plan_images(plan_id: int, *, base_url: str) -> None:
    """
    Background: attach real images to a stored daily plan without blocking the /generate response.

    This updates the `meal_plans.recipes.meals[*].image_url` fields in-place and relies on the same
    per-user daily limits as on-demand image generation.
    """

    db = SessionLocal()
    try:
        plan = db.query(MealPlan).filter(MealPlan.id == int(plan_id)).first()
        if not plan:
            return
        user = db.query(User).filter(User.id == plan.user_id).first()
        if not user:
            return
        if not get_access_snapshot(db, user).allowed:
            return

        decoded = _decode_plan_payload(plan.recipes)
        meals = decoded.get("meals") or []
        if not isinstance(meals, list) or not meals:
            return

        # Only generate for items that are missing a real image.
        try:
            attach_recipe_images(
                db,
                user=user,
                recipes=[m for m in meals if isinstance(m, dict)],
                ingredients=[],
                base_url=base_url,
                # Daily plan can contain multiple meals; generate a few per refresh.
                max_generate=6,
            )
        except Exception:
            logger.exception("Daily plan image refresh failed plan_id=%s user_id=%s", int(plan_id), getattr(user, "id", None))
            return

        # Persist back to DB so future /today calls return images immediately.
        payload = dict(plan.recipes or {})
        payload["meals"] = meals
        plan.recipes = payload
        db.add(plan)
        db.commit()
    except Exception:
        logger.exception("Daily plan image refresh crashed plan_id=%s", int(plan_id))
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        try:
            db.close()
        except Exception:
            pass


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


def _range_mid(value) -> float | None:
    """'35-45g' -> 40, '20g' -> 20, 30 -> 30."""
    if isinstance(value, (int, float)):
        return float(value)
    nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", str(value or ""))]
    return sum(nums[:2]) / len(nums[:2]) if nums else None


def _with_glucose_impact(meal):
    """Adds the typical glucose impact (Gentle / Moderate / Sharp) for one plan meal."""
    if not isinstance(meal, dict):
        return meal
    est = meal.get("nutrition_estimate") if isinstance(meal.get("nutrition_estimate"), dict) else {}
    impact = glucose_impact.estimate_impact(
        carbs_g=_range_mid(est.get("carbs_g")),
        fiber_g=_range_mid(est.get("fiber_g")),
        protein_g=_range_mid(est.get("protein_g")),
        fat_g=_range_mid(est.get("fat_g")),
    )
    if impact:
        impact["portion"] = "per serving"
    return {**meal, "glucose_impact": impact}


PLAN_DAYS_AHEAD = 2  # today plus the next two days


def _local_today(local_today: date | None) -> date:
    """The user's own calendar day (sent by the app). The server clock is UTC, which is a
    day off for many users in the evening; only trust values within a day of UTC."""
    utc_today = datetime.utcnow().date()
    if local_today and abs((local_today - utc_today).days) <= 1:
        return local_today
    return utc_today


def _check_plannable(plan_date: date, today: date) -> None:
    if plan_date < today:
        raise HTTPException(status_code=400, detail={"code": "past_date", "message": "You can only plan today or the next two days."})
    if plan_date > today + timedelta(days=PLAN_DAYS_AHEAD):
        raise HTTPException(status_code=400, detail={"code": "too_far", "message": "You can plan up to two days ahead."})


def _find_plan(db: Session, user_id: int, plan_date: date) -> MealPlan | None:
    return (
        db.query(MealPlan)
        .filter(MealPlan.user_id == user_id, MealPlan.plan_date == plan_date)
        .order_by(MealPlan.id.desc())
        .first()
    )


def _eaten_titles(db: Session, user_id: int, plan_date: date) -> set[str]:
    """Plan meals the user logged with 'I ate this' (matched by title, around that day)."""
    start = datetime.combine(plan_date, datetime.min.time()) - timedelta(hours=14)
    end = datetime.combine(plan_date, datetime.min.time()) + timedelta(hours=38)
    rows = (
        db.query(MealLogEntry.food_name, MealLogEntry.description)
        .filter(MealLogEntry.user_id == user_id, MealLogEntry.logged_at >= start, MealLogEntry.logged_at < end)
        .all()
    )
    out = set()
    for food_name, description in rows:
        for v in (food_name, description):
            if isinstance(v, str) and v.strip():
                out.add(v.strip().lower())
    return out


def _serialize_plan(plan: MealPlan, db: Session | None = None):
    decoded = _decode_plan_payload(plan.recipes)
    meals = [_with_glucose_impact(m) for m in decoded["meals"]]
    if db is not None:
        eaten = _eaten_titles(db, plan.user_id, plan.plan_date)
        meals = [
            {**m, "eaten": str(m.get("title") or "").strip().lower() in eaten} if isinstance(m, dict) else m
            for m in meals
        ]
    impacts = [m.get("glucose_impact", {}).get("impact") for m in meals if isinstance(m, dict) and m.get("glucose_impact")]
    carbs = [_range_mid((m.get("nutrition_estimate") or {}).get("carbs_g")) for m in meals if isinstance(m, dict)]
    return {
        "id": plan.id,
        "plan_date": plan.plan_date.isoformat(),
        "meals": meals,
        "summary": decoded["summary"],
        "daily_nutrition_estimate": decoded["daily_nutrition_estimate"],
        # Day overview for the planner header.
        "day": {
            "carbs_g": round(sum(c for c in carbs if c is not None)) if any(c is not None for c in carbs) else None,
            "impact_counts": {k: impacts.count(k) for k in ("gentle", "moderate", "sharp") if impacts.count(k)},
            "eaten": sum(1 for m in meals if isinstance(m, dict) and m.get("eaten")),
            "total": len(meals),
        },
    }


def _attach_images(db: Session, request: Request, user: User, meals: list) -> None:
    try:
        if get_access_snapshot(db, user).allowed:
            attach_recipe_images(
                db,
                user=user,
                recipes=[m for m in meals if isinstance(m, dict)],
                ingredients=[],
                base_url=str(request.base_url).rstrip("/"),
                max_generate=len(meals),
            )
    except Exception:
        pass


def _personal_guidance(db: Session, user: User) -> str:
    """Fit the plan to the user: their carb goal, and foods their own glucose readings say
    work for them or push them above target."""
    from .app_health_log import _carb_goal_for_user
    from ...models.glucose_reading import GlucoseReading
    from ...services import glucose_insights, glucose_targets

    lines: list[str] = []
    goal, mode = _carb_goal_for_user(user)
    if mode == "ceiling" and goal:
        per_meal = round(goal / 3)
        lines.append(
            f"Carb goal: keep the whole day at or under about {goal}g carbs. Aim for about {per_meal}g or less "
            "for each main meal and under 15g for the snack."
        )
    elif mode == "floor" and goal:
        lines.append(f"Carbs: include at least {goal}g carbs across the day, spread evenly over the meals.")
    else:
        lines.append("Carbs: keep carbs moderate and consistent from meal to meal.")

    try:
        since = datetime.utcnow() - timedelta(days=60)
        meals = db.query(MealLogEntry).filter(MealLogEntry.user_id == user.id, MealLogEntry.logged_at >= since).limit(500).all()
        readings = db.query(GlucoseReading).filter(GlucoseReading.user_id == user.id, GlucoseReading.logged_at >= since).limit(2000).all()
        if meals and readings:
            food = glucose_insights.build_insights(meals, readings, [], glucose_targets.targets_for(user), 60)["food"]
            avoid = [f["name"] for f in food.get("foods_to_watch") or []][:5]
            prefer = [f["name"] for f in food.get("foods_that_work") or []][:5]
            if avoid:
                lines.append(
                    "This user's own glucose readings went above target after: " + ", ".join(avoid)
                    + ". Do not include these; choose different dishes."
                )
            if prefer:
                lines.append(
                    "Foods that kept this user's glucose on target: " + ", ".join(prefer)
                    + ". Include one of them (or a close variation) where it fits."
                )
    except Exception:
        logger.warning("Daily plan personal guidance failed user_id=%s", user.id, exc_info=True)
    return "\n".join(lines)


def _enforce_plan_limits(db: Session, user: User) -> None:
    per_minute_limit = 3  # allows "plan the next 3 days" in one go
    guardrails = get_ai_guardrail_settings(db)
    premium_per_day_limit = int(guardrails.premium_daily_plan_daily)
    cache = CacheService()
    if cache.incr(f"daily_plan:rl:v1:user:{user.id}", ttl_seconds=60) > per_minute_limit:
        raise HTTPException(
            status_code=429,
            detail={"code": "rate_limited", "message": "You're generating too fast. Please wait a moment and try again.",
                    "limit_per_minute": per_minute_limit},
        )
    if premium_per_day_limit > 0:
        now = datetime.utcnow()
        used_today = (
            db.query(AIRequest)
            .filter(AIRequest.user_id == user.id, AIRequest.request_type == "daily_plan",
                    AIRequest.created_at >= datetime(now.year, now.month, now.day))
            .count()
        )
        if used_today >= premium_per_day_limit:
            raise HTTPException(
                status_code=429,
                detail={"code": "daily_limit_reached", "message": "Daily Meal Planner limit reached. Please try again tomorrow.",
                        "limit_per_day": premium_per_day_limit},
            )


def _record(db: Session, request: Request, user: User, tier: str, model: str) -> None:
    try:
        record_ai_request(db, user_id=user.id, tier=tier, request_type="daily_plan", model_used=model,
                          tokens_used=0, cost_estimate=0.0, device_id=request.headers.get("x-device-id"))
    except Exception:
        pass


def _nearby_titles(db: Session, user_id: int, plan_date: date, exclude_id: int | None = None) -> list[str]:
    """Titles from plans 3 days before to 2 days after, so neighbouring days don't repeat."""
    rows = (
        db.query(MealPlan)
        .filter(MealPlan.user_id == user_id,
                MealPlan.plan_date >= plan_date - timedelta(days=3),
                MealPlan.plan_date <= plan_date + timedelta(days=PLAN_DAYS_AHEAD))
        .all()
    )
    titles = []
    for p in rows:
        if exclude_id is not None and p.id == exclude_id:
            continue
        for meal in _decode_plan_payload(p.recipes).get("meals") or []:
            title = meal.get("title") if isinstance(meal, dict) else None
            if isinstance(title, str) and title.strip():
                titles.append(title.strip())
    return titles


def _run_generation(db: Session, request: Request, user: User, tier: str, plan_date: date, *,
                    avoid: list[str], guidance: str, force: bool) -> dict:
    service = DailyPlanService()
    profile_text = build_food_profile_instructions(extract_food_profile(user), strength="strong", mode="quick", has_ingredients=False)
    try:
        return service.generate(
            plan_date=plan_date,
            profile_instructions=profile_text,
            avoid_titles=avoid,
            variation_seed=None if not force else datetime.utcnow().isoformat(),
            guidance=guidance,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        logger.warning("Daily plan generation invalid output user_id=%s: %s", user.id, str(exc))
        _record(db, request, user, tier, "failed")
        db.commit()
        raise HTTPException(status_code=502, detail="Could not generate plan. Please try again.") from exc
    except Exception:
        logger.exception("Daily plan generation failed user_id=%s", user.id)
        _record(db, request, user, tier, "failed")
        db.commit()
        raise HTTPException(status_code=500, detail="Could not generate plan. Please try again.") from None


@router.get("/today")
def get_today_plan(
    request: Request,
    local_today: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = _local_today(local_today)
    plan = _find_plan(db, current_user.id, today)
    if not plan:
        return {"plan": None}
    decoded = _decode_plan_payload(plan.recipes)
    _attach_images(db, request, current_user, decoded.get("meals") or [])
    return {"plan": _serialize_plan(plan, db)}


@router.get("/days")
def planned_days(
    local_today: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Which days around today already have a plan (for the ticks on the day strip)."""
    today = _local_today(local_today)
    rows = (
        db.query(MealPlan.plan_date)
        .filter(MealPlan.user_id == current_user.id,
                MealPlan.plan_date >= today - timedelta(days=7),
                MealPlan.plan_date <= today + timedelta(days=PLAN_DAYS_AHEAD))
        .all()
    )
    return {
        "today": today.isoformat(),
        "last_plannable": (today + timedelta(days=PLAN_DAYS_AHEAD)).isoformat(),
        "planned": sorted({r[0].isoformat() for r in rows}),
    }


@router.get("/date")
def get_plan_by_date(
    request: Request,
    plan_date: date = Query(...),
    local_today: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = _local_today(local_today)
    if plan_date > today + timedelta(days=PLAN_DAYS_AHEAD):
        return {"plan": None, "future": True, "can_generate": False}
    can_generate = today <= plan_date <= today + timedelta(days=PLAN_DAYS_AHEAD)
    plan = _find_plan(db, current_user.id, plan_date)
    if not plan:
        return {"plan": None, "future": plan_date > today, "can_generate": can_generate}
    decoded = _decode_plan_payload(plan.recipes)
    try:
        _attach_images(db, request, current_user, decoded.get("meals") or [])
        payload = dict(plan.recipes or {}) if isinstance(plan.recipes, dict) else {}
        payload["meals"] = decoded["meals"]
        plan.recipes = payload
        db.add(plan)
        db.commit()
        db.refresh(plan)
    except Exception:
        db.rollback()
    return {"plan": _serialize_plan(plan, db), "future": plan_date > today, "can_generate": can_generate}


@router.post("/generate")
def generate_plan(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    force: bool = Query(False),
    plan_date: date | None = Query(None),
    local_today: date | None = Query(None),
):
    """Plan a day: today by default, or up to two days ahead (in the user's own timezone)."""
    require_ai_feature_access(current_user, db)
    tier = get_effective_subscription_tier(db, current_user) or "free"
    today = _local_today(local_today)
    target = plan_date or today
    _check_plannable(target, today)

    existing = _find_plan(db, current_user.id, target)
    if existing and not force:
        decoded = _decode_plan_payload(existing.recipes)
        _attach_images(db, request, current_user, decoded.get("meals") or [])
        return {"plan": _serialize_plan(existing, db)}

    _enforce_plan_limits(db, current_user)
    generated = _run_generation(
        db, request, current_user, tier, target,
        avoid=_nearby_titles(db, current_user.id, target, exclude_id=existing.id if existing else None)
        + ([str(m.get("title")) for m in _decode_plan_payload(existing.recipes).get("meals") or [] if isinstance(m, dict)] if existing else []),
        guidance=_personal_guidance(db, current_user),
        force=force,
    )
    meals = generated.get("meals") or []
    if not isinstance(meals, list) or not meals:
        raise HTTPException(status_code=500, detail="Invalid plan output. Please try again.")
    _attach_images(db, request, current_user, meals)

    payload_to_store = {
        "meals": meals,
        "summary": generated.get("summary") if isinstance(generated.get("summary"), str) else "",
        "daily_nutrition_estimate": generated.get("daily_nutrition_estimate")
        if isinstance(generated.get("daily_nutrition_estimate"), dict) else None,
        "provider": generated.get("provider"),
        "model": generated.get("model"),
    }
    _record(db, request, current_user, tier, str(generated.get("model") or "unknown"))
    if existing:
        existing.recipes = payload_to_store
        plan = existing
        event, label = "daily_plan.updated", "Updated daily meal plan"
    else:
        plan = MealPlan(user_id=current_user.id, plan_date=target, recipes=payload_to_store)
        event, label = "daily_plan.created", "Created daily meal plan"
    db.add(plan)
    add_user_activity(db, user_id=current_user.id, event_type=event, label=label, source="mobile",
                      metadata={"plan_date": target.isoformat(), "meal_count": len(meals), "days_ahead": (target - today).days})
    db.commit()
    db.refresh(plan)
    return {"plan": _serialize_plan(plan, db)}


@router.post("/swap-meal")
def swap_meal(
    request: Request,
    meal: str = Query(..., pattern="^(breakfast|lunch|dinner|snack)$"),
    plan_date: date | None = Query(None),
    local_today: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace one meal of a plan and keep the others (instead of regenerating the day)."""
    require_ai_feature_access(current_user, db)
    tier = get_effective_subscription_tier(db, current_user) or "free"
    today = _local_today(local_today)
    target = plan_date or today
    _check_plannable(target, today)
    plan = _find_plan(db, current_user.id, target)
    if not plan:
        raise HTTPException(status_code=404, detail={"code": "no_plan", "message": "Plan this day first."})
    decoded = _decode_plan_payload(plan.recipes)
    meals = [m for m in decoded.get("meals") or [] if isinstance(m, dict)]
    current = next((m for m in meals if m.get("meal") == meal), None)
    if not current:
        raise HTTPException(status_code=404, detail={"code": "no_meal", "message": "That meal isn't in this plan."})

    _enforce_plan_limits(db, current_user)
    keep = "; ".join(f"{m.get('meal')}: {m.get('title')}" for m in meals if m.get("meal") != meal)
    guidance = (
        _personal_guidance(db, current_user)
        + f"\nKeep these meals exactly as they are: {keep}."
        + f"\nCreate a NEW {meal} that is clearly different from \"{current.get('title')}\"."
    )
    generated = _run_generation(
        db, request, current_user, tier, target,
        avoid=_nearby_titles(db, current_user.id, target) + [str(current.get("title") or "")],
        guidance=guidance, force=True,
    )
    replacement = next((m for m in generated.get("meals") or [] if isinstance(m, dict) and m.get("meal") == meal), None)
    if not replacement:
        raise HTTPException(status_code=502, detail="Could not swap this meal. Please try again.")
    _attach_images(db, request, current_user, [replacement])
    new_meals = [replacement if m.get("meal") == meal else m for m in meals]
    payload = dict(plan.recipes or {}) if isinstance(plan.recipes, dict) else {}
    payload["meals"] = new_meals
    plan.recipes = payload
    _record(db, request, current_user, tier, str(generated.get("model") or "unknown"))
    db.add(plan)
    add_user_activity(db, user_id=current_user.id, event_type="daily_plan.meal_swapped", label="Swapped a planned meal",
                      source="mobile", metadata={"plan_date": target.isoformat(), "meal": meal})
    db.commit()
    db.refresh(plan)
    return {"plan": _serialize_plan(plan, db)}
