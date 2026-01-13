from datetime import date

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.ai_request import AIRequest
from ...models.favorite import Favorite
from ...models.recipe_history import RecipeHistory
from ...models.user import SearchLog, User
from ..dependencies import check_user_access, get_current_user

router = APIRouter(prefix="/user", tags=["user"])


@router.get("/profile")
def profile(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "subscription_tier": current_user.subscription_tier,
    }


@router.get("/scans-today")
def scans_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    device_id: str | None = Header(None, alias="X-Device-Id"),
):
    today = date.today()
    tomorrow = date.fromordinal(today.toordinal() + 1)
    ai_count = (
        db.query(AIRequest)
        .filter(
            AIRequest.user_id == current_user.id,
            AIRequest.request_type.in_(["vision", "text"]),
            AIRequest.created_at >= today,
            AIRequest.created_at < tomorrow,
        )
        .count()
    )
    text_count = (
        db.query(SearchLog)
        .filter(SearchLog.user_id == current_user.id, SearchLog.executed_at == today)
        .count()
    )
    access = check_user_access(current_user, db, device_id)
    response = {
        "ai_scans": ai_count,
        "text_searches": text_count,
        "total": ai_count + text_count,
        "searches_left": access["searches_left"],
        "device_searches_left": access.get("device_searches_left"),
        "daily_limit": access.get("daily_limit"),
        "subscription_tier": current_user.subscription_tier or "free",
        "is_premium": current_user.subscription_tier == "premium",
    }
    if device_id:
        device_ai = (
            db.query(AIRequest)
            .filter(
                AIRequest.device_id == device_id,
                AIRequest.request_type.in_(["vision", "text"]),
                AIRequest.created_at >= today,
                AIRequest.created_at < tomorrow,
            )
            .count()
        )
        device_text = (
            db.query(SearchLog)
            .filter(SearchLog.device_id == device_id, SearchLog.executed_at == today)
            .count()
        )
        response["device_total"] = device_ai + device_text
    return response


@router.get("/stats")
def user_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe_histories = (
        db.query(RecipeHistory)
        .filter(RecipeHistory.user_id == current_user.id)
        .all()
    )
    recipes_generated = sum(len(row.recipes or []) for row in recipe_histories)
    favorites_saved = (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id)
        .count()
    )

    today = date.today()
    tomorrow = date.fromordinal(today.toordinal() + 1)
    scans_today_count = (
        db.query(AIRequest)
        .filter(
            AIRequest.user_id == current_user.id,
            AIRequest.request_type.in_(["vision", "text"]),
            AIRequest.created_at >= today,
            AIRequest.created_at < tomorrow,
        )
        .count()
    )
    return {
        "recipes_generated": recipes_generated,
        "favorites_saved": favorites_saved,
        "scans_today": scans_today_count,
    }
