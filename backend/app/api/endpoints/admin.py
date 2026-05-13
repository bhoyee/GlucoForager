import os
import uuid
import json
from datetime import datetime
from datetime import timedelta
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, EmailStr, Field, HttpUrl, field_validator
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...core.config import settings
from ...core.security import create_access_token, get_password_hash, verify_password
from ...database import get_db
from ...models.admin_user import AdminUser
from ...models.staff_user import StaffUser
from ...models.ai_job import AIJob
from ...models.ai_request import AIRequest
from ...models.favorite import Favorite
from ...models.meal_plan import MealPlan
from ...models.password_reset import PasswordResetToken
from ...models.recipe import Recipe
from ...models.recipe_history import RecipeHistory
from ...models.shopping_item import ShoppingItem
from ...models.refresh_token import RefreshToken
from ...models.subscription import Subscription
from ...models.user import SearchLog, User
from ...models.user_activity_event import UserActivityEvent
from ...services.redis_ai_queue import RedisAIQueue
from ...services.recipe_upload_storage_service import store_recipe_image_upload
from ...services.staff_rbac_service import StaffRBACService
from ...services.subscription_service import is_subscription_active, is_premium_blocked, refresh_user_tier
from ...services.cache_service import CacheService

router = APIRouter(prefix="/admin", tags=["admin"])
admin_cache = CacheService()


class AdminLoginPayload(BaseModel):
    email: EmailStr
    password: str


class AdminToken(BaseModel):
    access_token: str
    token_type: str = "bearer"


class IngredientInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    quantity: str | None = Field(None, max_length=50)
    unit: str | None = Field(None, max_length=20)
    note: str | None = Field(None, max_length=120)


class NutritionInput(BaseModel):
    calories: float | None = Field(None, ge=0)
    carbs: float | None = Field(None, ge=0)
    protein: float | None = Field(None, ge=0)
    fat: float | None = Field(None, ge=0)
    fiber: float | None = Field(None, ge=0)
    sugar: float | None = Field(None, ge=0)


class RecipePayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    meal_type: str = Field(..., min_length=3, max_length=20)
    description: str | None = Field(None, max_length=500)
    prep_time_minutes: int | None = Field(None, ge=0)
    cook_time_minutes: int | None = Field(None, ge=0)
    servings: int | None = Field(None, ge=1)
    image_url: HttpUrl
    ingredients: list[IngredientInput]
    instructions: list[str]
    nutrition: NutritionInput | None = None

    @field_validator("meal_type")
    def validate_meal_type(cls, value: str) -> str:  # noqa: N805
        normalized = value.strip().lower()
        allowed = {"breakfast", "lunch", "dinner", "snack"}
        if normalized not in allowed:
            raise ValueError("meal_type must be breakfast, lunch, dinner, or snack")
        return normalized

    @field_validator("instructions")
    def validate_instructions(cls, value: list[str]) -> list[str]:  # noqa: N805
        cleaned = [step.strip() for step in value if step.strip()]
        if not cleaned:
            raise ValueError("At least one instruction is required")
        return cleaned


class AdminUserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(None, max_length=120)
    gender: str | None = Field(None, max_length=32)
    country: str | None = Field(None, max_length=120)


class AdminSuspendPayload(BaseModel):
    reason: str | None = Field(None, max_length=200)


class AdminTierPayload(BaseModel):
    tier: str = Field(..., min_length=3, max_length=20)
    expires_at: datetime | None = None

    @field_validator("tier")
    def validate_tier(cls, value: str) -> str:  # noqa: N805
        normalized = value.strip().lower()
        if normalized not in {"free", "premium"}:
            raise ValueError("tier must be free or premium")
        return normalized


class AdminPremiumBlockPayload(BaseModel):
    reason: str | None = Field(None, max_length=200)
    until: datetime | None = None


@router.post("/login", response_model=AdminToken)
def admin_login(payload: AdminLoginPayload, db: Session = Depends(get_db)):
    email = payload.email.lower()
    admin = db.query(AdminUser).filter(AdminUser.email == email).first()
    if not admin or not verify_password(payload.password, admin.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    # If this admin account maps to a staff user, enforce staff status here too
    # so disabled/deleted staff cannot even obtain a token.
    staff = db.query(StaffUser).filter(StaffUser.email == email).first()
    if staff and not StaffRBACService.is_active_staff(staff):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff account disabled")
    token = create_access_token({"sub": str(admin.id), "role": "admin"})
    return AdminToken(access_token=token)


@router.post("/recipes", response_model=dict)
def create_recipe(
    payload: RecipePayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    recipe = Recipe(
        name=payload.name.strip(),
        meal_type=payload.meal_type,
        description=payload.description.strip() if payload.description else None,
        prep_time_minutes=payload.prep_time_minutes,
        cook_time_minutes=payload.cook_time_minutes,
        servings=payload.servings,
        image_url=payload.image_url.strip(),
        ingredients=[item.dict() for item in payload.ingredients],
        instructions=payload.instructions,
        nutrition=payload.nutrition.dict() if payload.nutrition else None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return {"id": recipe.id}


@router.get("/recipes")
def list_recipes(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    items = db.query(Recipe).order_by(Recipe.created_at.desc()).all()
    return {
        "total": len(items),
        "items": [
            {
                "id": r.id,
                "name": r.name,
                "meal_type": r.meal_type,
                "image_url": r.image_url,
                "prep_time_minutes": r.prep_time_minutes,
                "cook_time_minutes": r.cook_time_minutes,
                "servings": r.servings,
                "nutrition": r.nutrition,
                "created_at": r.created_at,
            }
            for r in items
        ]
    }


@router.get("/users")
def list_users(
    q: str | None = None,
    tier: str | None = None,
    status_filter: str | None = None,
    sort: str | None = None,
    order: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    sort_key = sort or "created_at"
    sort_order = (order or "desc").lower()

    billing_latest_sub = (
        db.query(
            Subscription.user_id.label("user_id"),
            func.max(Subscription.started_at).label("max_started_at"),
        )
        .filter(or_(Subscription.store.is_(None), Subscription.store != "admin"))
        .group_by(Subscription.user_id)
        .subquery()
    )
    billing_sub_join = (
        db.query(Subscription)
        .join(
            billing_latest_sub,
            (Subscription.user_id == billing_latest_sub.c.user_id)
            & (Subscription.started_at == billing_latest_sub.c.max_started_at),
        )
        .subquery()
    )

    comp_latest_sub = (
        db.query(
            Subscription.user_id.label("user_id"),
            func.max(Subscription.started_at).label("max_started_at"),
        )
        .filter(Subscription.store == "admin", Subscription.plan == "premium")
        .group_by(Subscription.user_id)
        .subquery()
    )
    comp_sub_join = (
        db.query(Subscription)
        .join(
            comp_latest_sub,
            (Subscription.user_id == comp_latest_sub.c.user_id)
            & (Subscription.started_at == comp_latest_sub.c.max_started_at),
        )
        .subquery()
    )

    query = (
        db.query(
            User,
            billing_sub_join.c.status.label("billing_status"),
            billing_sub_join.c.expires_at.label("billing_expires_at"),
            billing_sub_join.c.store.label("billing_store"),
            billing_sub_join.c.product_id.label("billing_product_id"),
            billing_sub_join.c.started_at.label("billing_started_at"),
            comp_sub_join.c.status.label("comp_status"),
            comp_sub_join.c.expires_at.label("comp_expires_at"),
            comp_sub_join.c.started_at.label("comp_started_at"),
        )
        .outerjoin(billing_sub_join, User.id == billing_sub_join.c.user_id)
        .outerjoin(comp_sub_join, User.id == comp_sub_join.c.user_id)
    )

    if q:
        search = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(User.email).like(search)
            | func.lower(func.coalesce(User.full_name, "")).like(search)
        )

    now = datetime.utcnow()
    billing_active = and_(
        billing_sub_join.c.status.is_not(None),
        billing_sub_join.c.status == "active",
        or_(billing_sub_join.c.expires_at.is_(None), billing_sub_join.c.expires_at > now),
    )
    comp_active = and_(
        comp_sub_join.c.status.is_not(None),
        comp_sub_join.c.status == "active",
        or_(comp_sub_join.c.expires_at.is_(None), comp_sub_join.c.expires_at > now),
    )
    not_blocked = or_(
        User.premium_access_blocked_at.is_(None),
        and_(User.premium_access_blocked_until.is_not(None), User.premium_access_blocked_until <= now),
    )
    effective_premium = and_(not_blocked, or_(billing_active, comp_active))

    if tier in {"free", "premium"}:
        if tier == "premium":
            query = query.filter(effective_premium)
        else:
            query = query.filter(~effective_premium)

    if status_filter in {"active", "inactive"}:
        if status_filter == "active":
            query = query.filter(effective_premium)
        else:
            query = query.filter(~effective_premium)

    if sort_key == "email":
        order_column = User.email
    elif sort_key == "tier":
        order_column = User.subscription_tier
    else:
        order_column = User.created_at

    if sort_order == "asc":
        query = query.order_by(order_column.asc())
    else:
        query = query.order_by(order_column.desc())

    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for (
        user,
        billing_status_value,
        billing_expires_value,
        billing_store_value,
        billing_product_id_value,
        billing_started_value,
        comp_status_value,
        comp_expires_value,
        comp_started_value,
    ) in rows:
        blocked = is_premium_blocked(user, now=now)
        billing_is_active = (
            billing_status_value == "active"
            and (billing_expires_value is None or billing_expires_value > now)
        )
        comp_is_active = (
            comp_status_value == "active"
            and (comp_expires_value is None or comp_expires_value > now)
        )
        is_premium = (not blocked) and (billing_is_active or comp_is_active)
        status_label = "active" if is_premium else "inactive"
        expires_at = billing_expires_value if billing_is_active else comp_expires_value if comp_is_active else None
        tier_source = "blocked" if blocked else "store" if billing_is_active else "admin_comp" if comp_is_active else "free"
        items.append(
            {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "registered_platform": user.registered_platform,
                "registered_app_version": user.registered_app_version,
                "subscription_tier": "premium" if is_premium else "free",
                "tier_source": tier_source,
                "expires_at": expires_at,
                "status": status_label,
                "billing": {
                    "store": billing_store_value,
                    "status": billing_status_value,
                    "expires_at": billing_expires_value,
                    "product_id": billing_product_id_value,
                    "started_at": billing_started_value,
                },
                "admin_comp": {
                    "status": comp_status_value,
                    "expires_at": comp_expires_value,
                    "started_at": comp_started_value,
                },
                "premium_access_blocked": blocked,
                "premium_access_blocked_until": user.premium_access_blocked_until,
                "premium_access_blocked_reason": user.premium_access_blocked_reason,
                "suspended_at": user.suspended_at,
                "suspended_reason": user.suspended_reason,
                "last_active_at": user.last_active_at,
                "created_at": user.created_at,
            }
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/users/{user_id}")
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    subs = (
        db.query(Subscription)
        .filter(Subscription.user_id == user.id)
        .order_by(Subscription.started_at.desc())
        .all()
    )
    now = datetime.utcnow()
    billing = next((sub for sub in subs if sub.store != "admin"), None)
    comp = next((sub for sub in subs if sub.store == "admin" and sub.plan == "premium"), None)
    blocked = is_premium_blocked(user, now=now)
    billing_is_active = is_subscription_active(billing, now=now)
    comp_is_active = is_subscription_active(comp, now=now)
    effective_premium = (not blocked) and (billing_is_active or comp_is_active)
    status_label = "active" if effective_premium else "inactive"
    expires_at = billing.expires_at if billing_is_active and billing else comp.expires_at if comp_is_active and comp else None
    tier_source = "blocked" if blocked else "store" if billing_is_active else "admin_comp" if comp_is_active else "free"
    return {
        "id": user.id,
        "public_id": user.public_id,
        "email": user.email,
        "full_name": user.full_name,
        "gender": user.gender,
        "country": user.country,
        # Food preferences / onboarding profile (optional)
        "blood_sugar_profile": getattr(user, "blood_sugar_profile", None),
        "country_code": getattr(user, "country_code", None),
        "preferred_cuisines": getattr(user, "preferred_cuisines", None),
        "meal_goals": getattr(user, "meal_goals", None),
        "dietary_pattern": getattr(user, "dietary_pattern", None),
        "allergens": getattr(user, "allergens", None),
        "food_exclusions": getattr(user, "food_exclusions", None),
        "available_equipment": getattr(user, "available_equipment", None),
        "cook_time_preference": getattr(user, "cook_time_preference", None),
        "profile_completed": getattr(user, "profile_completed", None),
        "registered_platform": user.registered_platform,
        "registered_app_version": user.registered_app_version,
        "registered_build_number": user.registered_build_number,
        "registered_os_version": user.registered_os_version,
        "registered_device_model": user.registered_device_model,
        "subscription_tier": "premium" if effective_premium else "free",
        "tier_source": tier_source,
        "status": status_label,
        "expires_at": expires_at,
        "billing": None
        if not billing
        else {
            "plan": billing.plan,
            "status": billing.status,
            "started_at": billing.started_at,
            "expires_at": billing.expires_at,
            "transaction_id": billing.transaction_id,
            "original_transaction_id": billing.original_transaction_id,
            "product_id": billing.product_id,
            "store": billing.store,
            "environment": billing.environment,
        },
        "admin_comp": None
        if not comp
        else {
            "plan": comp.plan,
            "status": comp.status,
            "started_at": comp.started_at,
            "expires_at": comp.expires_at,
            "product_id": comp.product_id,
        },
        "premium_access_blocked": blocked,
        "premium_access_blocked_at": user.premium_access_blocked_at,
        "premium_access_blocked_until": user.premium_access_blocked_until,
        "premium_access_blocked_reason": user.premium_access_blocked_reason,
        "suspended_at": user.suspended_at,
        "suspended_reason": user.suspended_reason,
        "last_active_at": user.last_active_at,
        "created_at": user.created_at,
        "subscriptions": [
            {
                "id": sub.id,
                "plan": sub.plan,
                "status": sub.status,
                "started_at": sub.started_at,
                "expires_at": sub.expires_at,
                "transaction_id": sub.transaction_id,
                "original_transaction_id": sub.original_transaction_id,
                "product_id": sub.product_id,
                "store": sub.store,
                "environment": sub.environment,
            }
            for sub in subs
        ],
    }


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.email and payload.email.lower() != user.email:
        exists = db.query(User).filter(User.email == payload.email.lower()).first()
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
        user.email = payload.email.lower()

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip() or None
    if payload.gender is not None:
        user.gender = payload.gender.strip() or None
    if payload.country is not None:
        user.country = payload.country.strip() or None

    db.commit()
    return {"status": "updated"}


@router.post("/users/{user_id}/suspend")
def suspend_user(
    user_id: int,
    payload: AdminSuspendPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.suspended_at = datetime.utcnow()
    user.suspended_reason = payload.reason.strip() if payload.reason else None
    db.commit()
    return {"status": "suspended"}


@router.post("/users/{user_id}/unsuspend")
def unsuspend_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.suspended_at = None
    user.suspended_reason = None
    db.commit()
    return {"status": "active"}


@router.post("/users/{user_id}/tier")
def update_user_tier(
    user_id: int,
    payload: AdminTierPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    now = datetime.utcnow()
    tier = payload.tier
    if tier == "premium":
        if user.premium_access_blocked_at and (user.premium_access_blocked_until is None or user.premium_access_blocked_until > now):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is premium-blocked. Unblock first.")
        sub = Subscription(
            user_id=user.id,
            plan="premium",
            status="active",
            started_at=now,
            expires_at=payload.expires_at,
            product_id="admin_override",
            store="admin",
            environment="manual",
        )
        db.add(sub)
        refresh_user_tier(db, user, now=now)
        db.commit()
        return {"status": "updated", "tier": "premium"}

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Downgrading from admin is disabled. Users must cancel in the App Store / Google Play.",
    )


@router.post("/users/{user_id}/premium-block")
def premium_block_user(
    user_id: int,
    payload: AdminPremiumBlockPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    now = datetime.utcnow()
    user.premium_access_blocked_at = now
    user.premium_access_blocked_until = payload.until
    user.premium_access_blocked_reason = payload.reason.strip() if payload.reason else None
    refresh_user_tier(db, user, now=now)
    db.commit()
    return {"status": "blocked"}


@router.post("/users/{user_id}/premium-unblock")
def premium_unblock_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    now = datetime.utcnow()
    user.premium_access_blocked_at = None
    user.premium_access_blocked_until = None
    user.premium_access_blocked_reason = None
    refresh_user_tier(db, user, now=now)
    db.commit()
    return {"status": "unblocked"}


@router.post("/users/{user_id}/premium-comp-revoke")
def revoke_premium_comp(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    now = datetime.utcnow()
    db.query(Subscription).filter(
        Subscription.user_id == user.id,
        Subscription.store == "admin",
        Subscription.plan == "premium",
        Subscription.status == "active",
    ).update({Subscription.status: "inactive", Subscription.expires_at: now})
    refresh_user_tier(db, user, now=now)
    db.commit()
    return {"status": "revoked"}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    db.query(AIJob).filter(AIJob.user_id == user.id).delete(synchronize_session=False)
    db.query(AIRequest).filter(AIRequest.user_id == user.id).delete(synchronize_session=False)
    db.query(Favorite).filter(Favorite.user_id == user.id).delete(synchronize_session=False)
    db.query(MealPlan).filter(MealPlan.user_id == user.id).delete(synchronize_session=False)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete(synchronize_session=False)
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).delete(synchronize_session=False)
    db.query(RecipeHistory).filter(RecipeHistory.user_id == user.id).delete(synchronize_session=False)
    db.query(ShoppingItem).filter(ShoppingItem.user_id == user.id).delete(synchronize_session=False)
    db.query(Subscription).filter(Subscription.user_id == user.id).delete(synchronize_session=False)
    db.query(SearchLog).filter(SearchLog.user_id == user.id).delete(synchronize_session=False)
    db.query(UserActivityEvent).filter(UserActivityEvent.user_id == user.id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()
    return {"status": "deleted"}


@router.get("/recipes/{recipe_id}")
def get_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    return {
        "id": recipe.id,
        "name": recipe.name,
        "meal_type": recipe.meal_type,
        "description": recipe.description,
        "prep_time_minutes": recipe.prep_time_minutes,
        "cook_time_minutes": recipe.cook_time_minutes,
        "servings": recipe.servings,
        "image_url": recipe.image_url,
        "ingredients": recipe.ingredients,
        "instructions": recipe.instructions,
        "nutrition": recipe.nutrition,
        "created_at": recipe.created_at,
        "updated_at": recipe.updated_at,
    }


@router.put("/recipes/{recipe_id}")
def update_recipe(
    recipe_id: int,
    payload: RecipePayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    recipe.name = payload.name.strip()
    recipe.meal_type = payload.meal_type
    recipe.description = payload.description.strip() if payload.description else None
    recipe.prep_time_minutes = payload.prep_time_minutes
    recipe.cook_time_minutes = payload.cook_time_minutes
    recipe.servings = payload.servings
    recipe.image_url = payload.image_url.strip()
    recipe.ingredients = [item.dict() for item in payload.ingredients]
    recipe.instructions = payload.instructions
    recipe.nutrition = payload.nutrition.dict() if payload.nutrition else None
    recipe.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "updated"}


@router.delete("/recipes/{recipe_id}")
def delete_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    db.delete(recipe)
    db.commit()
    return {"status": "deleted"}


@router.post("/bootstrap")
def bootstrap_admin(
    payload: AdminLoginPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    One-time bootstrap to create the first admin user.
    Only allowed if no admin users exist.
    """
    token = settings.admin_bootstrap_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin bootstrap token not configured",
        )
    provided = request.headers.get("x-admin-bootstrap-token")
    if not provided or provided != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid bootstrap token")

    existing_staff = db.query(StaffUser).first()
    existing_admin = db.query(AdminUser).first()
    if existing_staff or existing_admin:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin already exists")

    email = payload.email.lower()
    hashed = get_password_hash(payload.password)

    # Create both records so older admin endpoints that still reference AdminUser continue to work.
    admin = AdminUser(email=email, hashed_password=hashed)
    staff = StaffUser(email=email, hashed_password=hashed, timezone="UTC", is_active=True)
    db.add(admin)
    db.add(staff)
    db.commit()
    return {"status": "created"}


@router.get("/status")
def admin_status(db: Session = Depends(get_db)):
    has_staff = db.query(StaffUser).first() is not None
    has_admin = db.query(AdminUser).first() is not None
    return {"has_admin": bool(has_staff or has_admin)}


@router.get("/ai/recipe-image-usage")
def recipe_image_usage(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    week_start = today_start - timedelta(days=today_start.weekday())  # Monday
    month_start = datetime(now.year, now.month, 1)

    def _count_and_cost(start: datetime) -> dict:
        q = db.query(AIRequest).filter(
            AIRequest.request_type == "recipe_image",
            AIRequest.created_at >= start,
            AIRequest.created_at <= now,
        )
        count = q.count()
        cost = (
            db.query(func.coalesce(func.sum(AIRequest.cost_estimate), 0))
            .filter(
                AIRequest.request_type == "recipe_image",
                AIRequest.created_at >= start,
                AIRequest.created_at <= now,
            )
            .scalar()
        )
        try:
            cost_value = float(cost or 0)
        except Exception:  # noqa: BLE001
            cost_value = 0.0
        return {"count": int(count), "cost_usd": cost_value}

    today = _count_and_cost(today_start)
    week = _count_and_cost(week_start)
    month = _count_and_cost(month_start)

    return {
        "currency": "USD",
        "today": today,
        "week": week,
        "month": month,
    }


def _mask_provider_error(exc: Exception) -> str:
    if isinstance(exc, urlerror.HTTPError):
        return f"Provider API returned HTTP {exc.code}"
    if isinstance(exc, urlerror.URLError):
        return "Provider API is unreachable"
    return "Provider API request failed"


def _http_json(method: str, url: str, *, headers: dict | None = None, body: dict | list | None = None, timeout: float = 8.0):
    payload = None
    request_headers = dict(headers or {})
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    req = urlrequest.Request(url, data=payload, headers=request_headers, method=method.upper())
    with urlrequest.urlopen(req, timeout=timeout) as response:  # noqa: S310 - fixed provider URLs from settings
        raw = response.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def _money_value(value) -> float | None:
    try:
        if value is None or value == "":
            return None
        numeric = float(value)
        return numeric if numeric == numeric else None
    except Exception:  # noqa: BLE001
        return None


def _provider_payload(name: str, *, configured: bool, status: str = "unknown", currency: str = "USD", balance=None, spend=None, usage=None, message: str = "") -> dict:
    return {
        "name": name,
        "configured": bool(configured),
        "status": status,
        "currency": currency or "USD",
        "balance": balance,
        "spend": spend or {},
        "usage": usage or {},
        "message": message,
    }


def _openai_costs(start: datetime, end: datetime) -> float | None:
    api_key = settings.openai_admin_api_key or settings.openai_api_key
    if not api_key:
        return None
    query = urlparse.urlencode(
        {
            "start_time": int(start.timestamp()),
            "end_time": int(end.timestamp()),
            "bucket_width": "1d",
        }
    )
    headers = {"Authorization": f"Bearer {api_key}"}
    if settings.openai_organization:
        headers["OpenAI-Organization"] = settings.openai_organization
    data = _http_json("GET", f"https://api.openai.com/v1/organization/costs?{query}", headers=headers)
    total = 0.0
    found = False
    for bucket in data.get("data") or []:
        for result in bucket.get("results") or []:
            amount = result.get("amount") if isinstance(result, dict) else None
            value = amount.get("value") if isinstance(amount, dict) else None
            numeric = _money_value(value)
            if numeric is not None:
                total += numeric
                found = True
    return total if found else None


def _openai_usage(start: datetime, end: datetime) -> dict:
    api_key = settings.openai_admin_api_key or settings.openai_api_key
    if not api_key:
        return {}
    query = urlparse.urlencode(
        {
            "start_time": int(start.timestamp()),
            "end_time": int(end.timestamp()),
            "bucket_width": "1d",
        }
    )
    headers = {"Authorization": f"Bearer {api_key}"}
    if settings.openai_organization:
        headers["OpenAI-Organization"] = settings.openai_organization
    data = _http_json("GET", f"https://api.openai.com/v1/organization/usage/completions?{query}", headers=headers)
    input_tokens = 0
    output_tokens = 0
    requests = 0
    for bucket in data.get("data") or []:
        for result in bucket.get("results") or []:
            if not isinstance(result, dict):
                continue
            try:
                input_tokens += int(result.get("input_tokens") or 0)
                output_tokens += int(result.get("output_tokens") or 0)
                requests += int(result.get("num_model_requests") or 0)
            except Exception:  # noqa: BLE001
                continue
    return {
        "monthly_input_tokens": input_tokens,
        "monthly_output_tokens": output_tokens,
        "monthly_total_tokens": input_tokens + output_tokens,
        "monthly_requests": requests,
    }


def _openai_credit_summary(now: datetime) -> dict:
    configured = bool(settings.openai_admin_api_key or settings.openai_api_key)
    if not configured:
        return _provider_payload("OpenAI", configured=False, status="not_configured", message="No OpenAI API key configured.")
    today_start = datetime(now.year, now.month, now.day)
    month_start = datetime(now.year, now.month, 1)
    spend: dict = {}
    usage: dict = {}
    errors: list[str] = []
    try:
        spend["today_usd"] = _openai_costs(today_start, now)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"today spend: {_mask_provider_error(exc)}")
    try:
        spend["month_usd"] = _openai_costs(month_start, now)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"month spend: {_mask_provider_error(exc)}")
    try:
        usage = _openai_usage(month_start, now)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"monthly tokens: {_mask_provider_error(exc)}")

    has_data = any(value is not None for value in spend.values()) or bool(usage)
    message = ""
    if errors:
        message = f"Some OpenAI metrics failed: {'; '.join(errors)}. Use an OpenAI organization Admin API key for costs/usage."
    return _provider_payload(
        "OpenAI",
        configured=True,
        status="connected" if has_data else "error",
        currency="USD",
        balance=None,
        spend=spend,
        usage=usage,
        message=message,
    )


def _deepseek_credit_summary(db: Session) -> dict:
    if not settings.deepseek_api_key:
        return _provider_payload("DeepSeek", configured=False, status="not_configured", message="No DeepSeek API key configured.")
    base_url = (settings.deepseek_base_url or "https://api.deepseek.com").strip().rstrip("/")
    if base_url.endswith("/v1"):
        base_url = base_url[:-3]
    try:
        data = _http_json("GET", f"{base_url}/user/balance", headers={"Authorization": f"Bearer {settings.deepseek_api_key}"})
        infos = data.get("balance_infos") if isinstance(data, dict) else None
        selected = None
        if isinstance(infos, list):
            selected = next((item for item in infos if str(item.get("currency") or "").upper() == "USD"), None)
            selected = selected or (infos[0] if infos else None)
        currency = str(selected.get("currency") or "USD").upper() if isinstance(selected, dict) else "USD"
        total = _money_value(selected.get("total_balance") if isinstance(selected, dict) else None)
        granted = _money_value(selected.get("granted_balance") if isinstance(selected, dict) else None)
        topped_up = _money_value(selected.get("topped_up_balance") if isinstance(selected, dict) else None)
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        token_sum = 0
        request_count = 0
        try:
            token_sum = int(
                db.query(func.coalesce(func.sum(AIRequest.tokens_used), 0))
                .filter(AIRequest.created_at >= month_start)
                .filter(func.lower(AIRequest.model_used).like("%deepseek%"))
                .scalar()
                or 0
            )
            request_count = int(
                db.query(func.count(AIRequest.id))
                .filter(AIRequest.created_at >= month_start)
                .filter(func.lower(AIRequest.model_used).like("%deepseek%"))
                .scalar()
                or 0
            )
        except Exception:  # noqa: BLE001
            token_sum = 0
            request_count = 0
        return _provider_payload(
            "DeepSeek",
            configured=True,
            status="connected" if data.get("is_available", True) else "unavailable",
            currency=currency,
            balance={"total": total, "granted": granted, "topped_up": topped_up},
            usage={
                "monthly_total_tokens": token_sum,
                "monthly_requests": request_count,
                "monthly_usage_note": "Tracked from local AI request rows.",
            },
            message="" if selected else "DeepSeek returned no balance rows.",
        )
    except Exception as exc:  # noqa: BLE001
        return _provider_payload("DeepSeek", configured=True, status="error", message=_mask_provider_error(exc))


def _runware_credit_summary() -> dict:
    if not settings.runware_api_key:
        return _provider_payload("Runware", configured=False, status="not_configured", message="No Runware API key configured.")
    try:
        data = _http_json(
            "POST",
            settings.runware_api_url,
            headers={"Authorization": f"Bearer {settings.runware_api_key}"},
            body=[{"taskType": "accountManagement", "taskUUID": str(uuid.uuid4()), "operation": "getDetails"}],
        )
        rows = data.get("data") if isinstance(data, dict) else None
        details = rows[0] if isinstance(rows, list) and rows else (data if isinstance(data, dict) else {})
        balance_value = details.get("balance") if isinstance(details, dict) else None
        balance_obj = balance_value if isinstance(balance_value, dict) else {}
        free_balance_value = balance_obj.get("freeBalance") or (details.get("freeBalance") if isinstance(details, dict) else None)
        currency = str(balance_obj.get("currency") or (details.get("currency") if isinstance(details, dict) else None) or "USD").upper()
        usage = details.get("usage") if isinstance(details, dict) and isinstance(details.get("usage"), dict) else {}
        return _provider_payload(
            "Runware",
            configured=True,
            status="connected",
            currency=currency,
            balance={"total": _money_value(balance_obj.get("amount") if balance_obj else balance_value), "free": _money_value(free_balance_value)},
            usage=usage,
        )
    except Exception as exc:  # noqa: BLE001
        return _provider_payload("Runware", configured=True, status="error", message=_mask_provider_error(exc))


@router.get("/ai/provider-credits")
def ai_provider_credits(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    cache_key = "admin:ai_provider_credits:v1"
    cached = admin_cache.get(cache_key)
    if cached:
        try:
            return json.loads(cached)
        except Exception:  # noqa: BLE001
            pass

    now = datetime.utcnow()
    payload = {
        "currency": "USD",
        "cached_for_seconds": 600,
        "generated_at": now.isoformat() + "Z",
        "providers": [
            _openai_credit_summary(now),
            _runware_credit_summary(),
            _deepseek_credit_summary(db),
        ],
    }
    try:
        admin_cache.set(cache_key, json.dumps(payload), ttl_seconds=600)
    except Exception:  # noqa: BLE001
        pass
    return payload


@router.get("/ai/queue-metrics")
def ai_queue_metrics(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    def _db_counts() -> dict:
        rows = db.query(AIJob.status, func.count(AIJob.id)).group_by(AIJob.status).all()
        counts: dict[str, int] = {}
        for status_value, count_value in rows or []:
            key = (status_value or "unknown").strip().lower()
            try:
                counts[key] = int(count_value or 0)
            except Exception:  # noqa: BLE001
                counts[key] = 0
        return counts

    def _find_group(groups: list, group_name: str) -> dict | None:
        if not groups:
            return None
        for item in groups:
            if isinstance(item, dict):
                if str(item.get("name", "")).strip() == group_name:
                    return item
        return None

    payload: dict = {
        "backend": (settings.ai_queue_backend or "db").strip().lower(),
        "db": {"counts": _db_counts()},
        "redis": {
            "available": False,
            "streams": {
                "text": {"name": str(settings.ai_queue_redis_stream_text), "length": None, "group": None},
                "vision": {"name": str(settings.ai_queue_redis_stream_vision), "length": None, "group": None},
            },
        },
    }

    q = RedisAIQueue.from_settings()
    if not q:
        return payload

    payload["redis"]["available"] = True
    for key, stream_name in (
        ("text", q.cfg.stream_text),
        ("vision", q.cfg.stream_vision),
    ):
        stream_info = payload["redis"]["streams"].get(key) or {"name": stream_name}
        stream_info["name"] = stream_name
        try:
            stream_info["length"] = int(q.client.xlen(stream_name))
        except Exception:  # noqa: BLE001
            stream_info["length"] = None

        try:
            group = _find_group(q.client.xinfo_groups(stream_name), q.cfg.group)
        except Exception:  # noqa: BLE001
            group = None

        if group:
            pending = group.get("pending")
            consumers = group.get("consumers")
            lag = group.get("lag")
            try:
                pending_value = int(pending) if pending is not None else None
            except Exception:  # noqa: BLE001
                pending_value = None
            try:
                consumers_value = int(consumers) if consumers is not None else None
            except Exception:  # noqa: BLE001
                consumers_value = None
            try:
                lag_value = int(lag) if lag is not None else None
            except Exception:  # noqa: BLE001
                lag_value = None

            stream_info["group"] = {
                "name": q.cfg.group,
                "pending": pending_value,
                "consumers": consumers_value,
                "lag": lag_value,
            }
        else:
            stream_info["group"] = {"name": q.cfg.group, "pending": None, "consumers": None, "lag": None}

        payload["redis"]["streams"][key] = stream_info

    return payload


@router.post("/uploads")
def upload_image(
    request: Request,
    file: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image uploads are allowed")

    extension = os.path.splitext(file.filename or "")[1].lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image type")

    try:
        url = store_recipe_image_upload(file, request_base_url=str(request.base_url))
    except ValueError as e:
        msg = str(e) or "Invalid upload"
        code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE if "too large" in msg.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=msg)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Upload failed")

    return {"url": url}
