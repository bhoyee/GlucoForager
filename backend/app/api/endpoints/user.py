import logging
from datetime import date
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import desc

from ...database import get_db
from ...core.security import get_password_hash
from ...models.ai_request import AIRequest
from ...models.ai_job import AIJob
from ...models.favorite import Favorite
from ...models.meal_plan import MealPlan
from ...models.password_reset import PasswordResetToken
from ...models.refresh_token import RefreshToken
from ...models.recipe_history import RecipeHistory
from ...models.shopping_item import ShoppingItem
from ...models.subscription import Subscription
from ...models.push_token import PushToken
from ...models.admin_push_send import AdminPushSendFailure
from ...models.user import SearchLog, User
from ...models.user_daily_challenge import UserDailyChallenge
from ...models.user_activity_event import UserActivityEvent
from ..dependencies import check_user_access, get_current_user
from ...services.subscription_service import get_effective_subscription_tier

router = APIRouter(prefix="/user", tags=["user"])
logger = logging.getLogger(__name__)


@router.get("/profile")
def profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    effective_tier = get_effective_subscription_tier(db, current_user)
    return {
        "id": current_user.id,
        "public_id": current_user.public_id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "gender": current_user.gender,
        "country": current_user.country,
        "blood_sugar_profile": getattr(current_user, "blood_sugar_profile", None),
        "country_code": getattr(current_user, "country_code", None),
        "preferred_cuisines": getattr(current_user, "preferred_cuisines", None),
        "meal_goals": getattr(current_user, "meal_goals", None),
        "dietary_pattern": getattr(current_user, "dietary_pattern", None),
        "allergens": getattr(current_user, "allergens", None),
        "food_exclusions": getattr(current_user, "food_exclusions", None),
        "available_equipment": getattr(current_user, "available_equipment", None),
        "cook_time_preference": getattr(current_user, "cook_time_preference", None),
        "profile_completed": getattr(current_user, "profile_completed", None),
        "subscription_tier": effective_tier,
        "is_premium": effective_tier == "premium",
        "premium_access_blocked": bool(getattr(current_user, "premium_access_blocked_at", None)),
        "premium_access_blocked_until": getattr(current_user, "premium_access_blocked_until", None),
    }


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    gender: str | None = None
    country: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    blood_sugar_profile: str | None = None
    country_code: str | None = None
    preferred_cuisines: list[str] | None = None
    meal_goals: list[str] | None = None
    dietary_pattern: str | None = None
    allergens: list[str] | None = None
    food_exclusions: list[str] | None = None
    available_equipment: list[str] | None = None
    cook_time_preference: str | None = None
    profile_completed: bool | None = None


def _clean_string_list(value: list[str] | None, *, max_items: int = 24, max_len: int = 40) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list):
        return None
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        cleaned = item.strip()
        if not cleaned:
            continue
        cleaned = cleaned[:max_len]
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
        if len(out) >= max_items:
            break
    return out


@router.patch("/profile")
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.email:
        new_email = payload.email.lower()
        if new_email != current_user.email:
            exists = db.query(User).filter(User.email == new_email).first()
            if exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already in use",
                )
            current_user.email = new_email

    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip() or None
    if payload.gender is not None:
        current_user.gender = payload.gender
    if payload.country is not None:
        current_user.country = payload.country

    if payload.password:
        if len(payload.password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 6 characters",
            )
        current_user.hashed_password = get_password_hash(payload.password)

    # Food profile fields (optional; onboarding).
    if payload.blood_sugar_profile is not None:
        current_user.blood_sugar_profile = payload.blood_sugar_profile.strip() or None
    if payload.country_code is not None:
        cc = payload.country_code.strip().upper()
        current_user.country_code = (cc[:2] if cc else None)
    if payload.preferred_cuisines is not None:
        current_user.preferred_cuisines = _clean_string_list(payload.preferred_cuisines, max_items=6, max_len=48) or []
    if payload.meal_goals is not None:
        current_user.meal_goals = _clean_string_list(payload.meal_goals, max_items=4, max_len=48) or []
    if payload.dietary_pattern is not None:
        current_user.dietary_pattern = payload.dietary_pattern.strip() or None
    if payload.allergens is not None:
        current_user.allergens = _clean_string_list(payload.allergens, max_items=24, max_len=48) or []
    if payload.food_exclusions is not None:
        current_user.food_exclusions = _clean_string_list(payload.food_exclusions, max_items=24, max_len=48) or []
    if payload.available_equipment is not None:
        current_user.available_equipment = _clean_string_list(payload.available_equipment, max_items=12, max_len=32) or []
    if payload.cook_time_preference is not None:
        current_user.cook_time_preference = payload.cook_time_preference.strip() or None
    if payload.profile_completed is not None:
        current_user.profile_completed = bool(payload.profile_completed)

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    effective_tier = get_effective_subscription_tier(db, current_user)
    return {
        "id": current_user.id,
        "public_id": current_user.public_id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "gender": current_user.gender,
        "country": current_user.country,
        "blood_sugar_profile": getattr(current_user, "blood_sugar_profile", None),
        "country_code": getattr(current_user, "country_code", None),
        "preferred_cuisines": getattr(current_user, "preferred_cuisines", None),
        "meal_goals": getattr(current_user, "meal_goals", None),
        "dietary_pattern": getattr(current_user, "dietary_pattern", None),
        "allergens": getattr(current_user, "allergens", None),
        "food_exclusions": getattr(current_user, "food_exclusions", None),
        "available_equipment": getattr(current_user, "available_equipment", None),
        "cook_time_preference": getattr(current_user, "cook_time_preference", None),
        "profile_completed": getattr(current_user, "profile_completed", None),
        "subscription_tier": effective_tier,
        "is_premium": effective_tier == "premium",
        "premium_access_blocked": bool(getattr(current_user, "premium_access_blocked_at", None)),
        "premium_access_blocked_until": getattr(current_user, "premium_access_blocked_until", None),
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
    effective_tier = get_effective_subscription_tier(db, current_user)
    response = {
        "ai_scans": ai_count,
        "text_searches": text_count,
        "total": ai_count + text_count,
        "searches_left": access["searches_left"],
        "device_searches_left": access.get("device_searches_left"),
        "daily_limit": access.get("daily_limit"),
        "limit_window_days": access.get("limit_window_days", 1),
        "subscription_tier": effective_tier or "free",
        "is_premium": effective_tier == "premium",
        "premium_access_blocked": bool(getattr(current_user, "premium_access_blocked_at", None)),
        "premium_access_blocked_until": getattr(current_user, "premium_access_blocked_until", None),
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


def _normalize_ingredient_list(items: list[str] | None, *, max_items: int = 20, max_len: int = 40) -> list[str]:
    if not items:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, str):
            continue
        cleaned = item.strip()
        if not cleaned:
            continue
        cleaned = cleaned.replace("\n", " ").replace("\r", " ")
        cleaned = " ".join(cleaned.split())
        cleaned = cleaned[:max_len]
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
        if len(out) >= max_items:
            break
    return out


@router.get("/last-ingredients")
def last_ingredients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the most recent ingredient list the user used for recipe generation.

    This backs the mobile "Use ingredients I have" flow so it works even after reinstall,
    cache clear, or when AsyncStorage isn't yet populated.
    """
    job = (
        db.query(AIJob)
        .filter(AIJob.user_id == current_user.id, AIJob.status == "completed")
        .order_by(desc(AIJob.updated_at))
        .first()
    )
    if not job:
        return {"ingredients": [], "source": None, "updated_at": None}

    payload = job.payload or {}
    result = job.result or {}
    ingredients: list[str] = []
    if job.source == "text":
        raw = payload.get("ingredients")
        if isinstance(raw, list):
            ingredients = [str(x) for x in raw]
    elif job.source in ("vision", "vision_batch"):
        raw = result.get("detected")
        if isinstance(raw, list):
            ingredients = [str(x) for x in raw]
        else:
            raw_all = result.get("detected_all")
            if isinstance(raw_all, list):
                ingredients = [str(x) for x in raw_all]

    ingredients = _normalize_ingredient_list(ingredients, max_items=20, max_len=40)
    return {
        "ingredients": ingredients,
        "source": job.source,
        "updated_at": job.updated_at.isoformat() if getattr(job, "updated_at", None) else None,
    }


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


@router.delete("/account")
def delete_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    try:
        # Delete dependent records first to avoid FK constraint errors.
        # Push notification tables: failures may not always store user_id, but can reference push_token_id.
        token_rows = (
            db.query(PushToken.id, PushToken.token)
            .filter(PushToken.user_id == user_id)
            .all()
        )
        push_token_ids = [row[0] for row in token_rows if row and row[0] is not None]
        push_tokens = [row[1] for row in token_rows if row and isinstance(row[1], str) and row[1]]

        db.query(AdminPushSendFailure).filter(AdminPushSendFailure.user_id == user_id).delete(synchronize_session=False)
        if push_token_ids:
            db.query(AdminPushSendFailure).filter(AdminPushSendFailure.push_token_id.in_(push_token_ids)).delete(
                synchronize_session=False
            )
        if push_tokens:
            db.query(AdminPushSendFailure).filter(AdminPushSendFailure.token.in_(push_tokens)).delete(
                synchronize_session=False
            )
        db.query(AIJob).filter(AIJob.user_id == user_id).delete(synchronize_session=False)
        db.query(AIRequest).filter(AIRequest.user_id == user_id).delete(synchronize_session=False)
        db.query(SearchLog).filter(SearchLog.user_id == user_id).delete(synchronize_session=False)
        db.query(Favorite).filter(Favorite.user_id == user_id).delete(synchronize_session=False)
        db.query(RecipeHistory).filter(RecipeHistory.user_id == user_id).delete(synchronize_session=False)
        db.query(Subscription).filter(Subscription.user_id == user_id).delete(synchronize_session=False)
        db.query(RefreshToken).filter(RefreshToken.user_id == user_id).delete(synchronize_session=False)
        db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user_id).delete(synchronize_session=False)
        db.query(MealPlan).filter(MealPlan.user_id == user_id).delete(synchronize_session=False)
        db.query(UserDailyChallenge).filter(UserDailyChallenge.user_id == user_id).delete(synchronize_session=False)
        db.query(ShoppingItem).filter(ShoppingItem.user_id == user_id).delete(synchronize_session=False)
        db.query(UserActivityEvent).filter(UserActivityEvent.user_id == user_id).delete(synchronize_session=False)
        db.query(PushToken).filter(PushToken.user_id == user_id).delete(synchronize_session=False)
        db.delete(current_user)
        db.commit()
        return {"detail": "Account deleted"}
    except Exception as exc:  # noqa: BLE001
        error_id = str(uuid.uuid4())
        db.rollback()
        logger.exception("Delete account failed user_id=%s error_id=%s: %s", user_id, error_id, str(exc)[:400])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to delete your account right now. Please try again later. (ref: {error_id})",
        )
