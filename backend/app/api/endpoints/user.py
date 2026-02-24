from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ...database import get_db
from ...core.security import get_password_hash
from ...models.ai_request import AIRequest
from ...models.favorite import Favorite
from ...models.recipe_history import RecipeHistory
from ...models.subscription import Subscription
from ...models.user import SearchLog, User
from ..dependencies import check_user_access, get_current_user
from ...services.subscription_service import get_effective_subscription_tier

router = APIRouter(prefix="/user", tags=["user"])


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


@router.get("/stats")
def user_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    tomorrow = date.fromordinal(today.toordinal() + 1)
    recipe_histories = (
        db.query(RecipeHistory)
        .filter(
            RecipeHistory.user_id == current_user.id,
            RecipeHistory.created_at >= today,
            RecipeHistory.created_at < tomorrow,
        )
        .all()
    )
    recipes_generated = sum(len(row.recipes or []) for row in recipe_histories)
    favorites_saved = (
        db.query(Favorite)
        .filter(
            Favorite.user_id == current_user.id,
            Favorite.created_at >= today,
            Favorite.created_at < tomorrow,
        )
        .count()
    )
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
    db.query(AIRequest).filter(AIRequest.user_id == user_id).delete(synchronize_session=False)
    db.query(SearchLog).filter(SearchLog.user_id == user_id).delete(synchronize_session=False)
    db.query(Favorite).filter(Favorite.user_id == user_id).delete(synchronize_session=False)
    db.query(RecipeHistory).filter(RecipeHistory.user_id == user_id).delete(synchronize_session=False)
    db.query(Subscription).filter(Subscription.user_id == user_id).delete(synchronize_session=False)
    db.delete(current_user)
    db.commit()
    return {"detail": "Account deleted"}
