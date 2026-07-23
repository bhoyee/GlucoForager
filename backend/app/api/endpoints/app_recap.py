from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.favorite import Favorite
from ...models.recipe_check_in import RecipeCheckIn
from ...models.recipe_history import RecipeHistory
from ...models.user import User
from ...services.daily_challenge_service import get_streak_days
from ..dependencies import get_current_user

router = APIRouter(prefix="/app", tags=["app"])


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

    return {
        "recipes_generated": recipes_generated,
        "favorites_added": favorites_added,
        "check_ins": feeling_counts,
        "top_recipe": top_recipe,
        "streak_days": streak_days,
    }
