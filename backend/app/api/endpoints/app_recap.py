from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.favorite import Favorite
from ...models.glucose_reading import GlucoseReading
from ...models.meal_log_entry import MealLogEntry
from ...models.recipe_check_in import RecipeCheckIn
from ...models.recipe_history import RecipeHistory
from ...models.user import User
from ...services.daily_challenge_service import get_streak_days
from ..dependencies import get_current_user
from .app_health_log import SPIKE_THRESHOLD_MGDL, _carb_goal_for_user, _find_preceding_meal

router = APIRouter(prefix="/app", tags=["app"])

# Same 70-180 mg/dL standard target range the Track Regularly screen buckets
# against - kept as its own constants here rather than importing, since it's a
# plain "where do readings sit" summary, distinct from app_health_log's
# spike/general-alert thresholds.
TARGET_LOW_MGDL = 70
TARGET_HIGH_MGDL = 180


@router.get("/recap/weekly")
def get_weekly_recap(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    week_ago = datetime.utcnow() - timedelta(days=7)

    recipe_histories = (
        db.query(RecipeHistory)
        .filter(RecipeHistory.user_id == current_user.id, RecipeHistory.created_at >= week_ago)
        .all()
    )
    recipes_generated = sum(len(row.recipes or []) for row in recipe_histories)

    favorites_added = (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id, Favorite.created_at >= week_ago)
        .count()
    )

    check_ins = (
        db.query(RecipeCheckIn)
        .filter(
            RecipeCheckIn.user_id == current_user.id,
            RecipeCheckIn.check_in_date >= week_ago.date(),
        )
        .all()
    )
    feeling_counts = {"great": 0, "ok": 0, "not_great": 0}
    great_counts_by_recipe: dict[str, dict] = {}
    for check_in in check_ins:
        if check_in.feeling in feeling_counts:
            feeling_counts[check_in.feeling] += 1
        if check_in.feeling == "great":
            entry = great_counts_by_recipe.setdefault(
                check_in.recipe_fingerprint, {"name": check_in.recipe_name, "count": 0}
            )
            entry["count"] += 1

    top_recipe = None
    if great_counts_by_recipe:
        best = max(great_counts_by_recipe.values(), key=lambda entry: entry["count"])
        top_recipe = {"name": best["name"], "great_count": best["count"]}

    streak_days = get_streak_days(db, user=current_user)

    readings = (
        db.query(GlucoseReading)
        .filter(GlucoseReading.user_id == current_user.id, GlucoseReading.logged_at >= week_ago)
        .all()
    )
    readings_logged = len(readings)
    average_mg_dl = round(sum(r.value_mg_dl for r in readings) / readings_logged, 1) if readings_logged else None
    in_range_count = sum(1 for r in readings if TARGET_LOW_MGDL <= r.value_mg_dl <= TARGET_HIGH_MGDL)
    high_count = sum(1 for r in readings if r.value_mg_dl > TARGET_HIGH_MGDL)
    low_count = sum(1 for r in readings if r.value_mg_dl < TARGET_LOW_MGDL)
    spikes_flagged = sum(
        1
        for r in readings
        if r.value_mg_dl >= SPIKE_THRESHOLD_MGDL
        and r.context != "fasting"
        and _find_preceding_meal(db, current_user.id, r.logged_at) is not None
    )

    meals_logged = (
        db.query(MealLogEntry)
        .filter(MealLogEntry.user_id == current_user.id, MealLogEntry.logged_at >= week_ago)
        .count()
    )

    carb_goal_g, carb_goal_mode = _carb_goal_for_user(current_user)
    meals_with_carbs = (
        db.query(MealLogEntry)
        .filter(
            MealLogEntry.user_id == current_user.id,
            MealLogEntry.logged_at >= week_ago,
            MealLogEntry.carbs_g.isnot(None),
        )
        .all()
    )
    carbs_by_day: dict = {}
    for meal in meals_with_carbs:
        day_key = meal.logged_at.date()
        carbs_by_day[day_key] = carbs_by_day.get(day_key, 0) + meal.carbs_g

    days_logged = len(carbs_by_day)
    days_met = None
    if carb_goal_mode == "ceiling" and carb_goal_g:
        days_met = sum(1 for total in carbs_by_day.values() if total <= carb_goal_g)
    elif carb_goal_mode == "floor" and carb_goal_g:
        days_met = sum(1 for total in carbs_by_day.values() if total >= carb_goal_g)

    return {
        "recipes_generated": recipes_generated,
        "favorites_added": favorites_added,
        "check_ins": feeling_counts,
        "top_recipe": top_recipe,
        "streak_days": streak_days,
        "meals_logged": meals_logged,
        "glucose": {
            "readings_logged": readings_logged,
            "average_mg_dl": average_mg_dl,
            "in_range_count": in_range_count,
            "high_count": high_count,
            "low_count": low_count,
            "spikes_flagged": spikes_flagged,
        },
        "carb_goal": {
            "goal_g": carb_goal_g,
            "mode": carb_goal_mode,
            "days_logged": days_logged,
            "days_met": days_met,
        },
    }
