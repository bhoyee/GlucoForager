import os
import uuid
import json
import html
import logging
import re
from datetime import datetime
from datetime import timedelta
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, EmailStr, Field, HttpUrl, field_validator
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin, get_current_staff_user
from ...core.config import settings
from ...core.security import create_access_token, get_password_hash, verify_password
from ...database import get_db
from ...models.admin_user import AdminUser
from ...models.staff_user import StaffUser
from ...models.ai_job import AIJob
from ...models.ai_request import AIRequest
from ...models.admin_push_send import AdminPushSendFailure
from ...models.favorite import Favorite
from ...models.meal_plan import MealPlan
from ...models.password_reset import PasswordResetToken
from ...models.push_token import PushToken
from ...models.recipe import Recipe
from ...models.recipe_history import RecipeHistory
from ...models.shopping_item import ShoppingItem
from ...models.refresh_token import RefreshToken
from ...models.subscription import Subscription
from ...models.user import SearchLog, User
from ...models.user_activity_event import UserActivityEvent
from ...models.user_daily_challenge import UserDailyChallenge
from ...services.redis_ai_queue import RedisAIQueue
from ...services.recipe_upload_storage_service import store_recipe_image_upload
from ...services.staff_rbac_service import StaffRBACService
from ...services.subscription_service import is_subscription_active, is_premium_blocked, refresh_user_tier
from ...services.trial_access_service import build_access_snapshot, get_access_snapshot
from ...services.cache_service import CacheService
from ...services.settings_service import get_ai_guardrail_settings
from ...services.recipe_generation_service import (
    RecipeGenerationError,
    RecipeGenerationParams,
    _has_blocking_recipe_safety_flag,
    _recipe_nutrition_safety_flags,
    generate_recipe_draft_batch,
)
from ...services.user_deletion_service import hard_delete_user, permanent_delete_at
from ...services.system_log_service import log_system_event

router = APIRouter(prefix="/admin", tags=["admin"])
admin_cache = CacheService()
logger = logging.getLogger(__name__)


ACCESS_STATUS_LABELS = {
    "premium": "Premium active",
    "trialing": "Store trial",
    "trial": "Store trial",
    "cancelled_active": "Cancelled - active until expiry",
    "legacy_grace": "Legacy grace",
    "grace": "Legacy grace",
    "expired": "Expired / no active subscription",
    "blocked": "Blocked",
    "suspended": "Suspended",
    "deleted": "Deleted",
}


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
    image_url: HttpUrl | None = None
    image_prompt: str | None = Field(None, max_length=500)
    ingredients: list[IngredientInput]
    instructions: list[str]
    nutrition: NutritionInput | None = None
    cuisine_tags: list[str] = Field(default_factory=list, max_length=12)
    dietary_tags: list[str] = Field(default_factory=list, max_length=12)
    allergen_tags: list[str] = Field(default_factory=list, max_length=16)
    food_exclusion_tags: list[str] = Field(default_factory=list, max_length=16)
    goal_tags: list[str] = Field(default_factory=list, max_length=16)
    equipment_tags: list[str] = Field(default_factory=list, max_length=16)
    diabetes_type_tags: list[str] = Field(default_factory=list, max_length=8)
    cook_time_tag: str | None = Field(None, max_length=30)
    status: str | None = Field(None, max_length=20)

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

    @field_validator(
        "cuisine_tags",
        "dietary_tags",
        "allergen_tags",
        "food_exclusion_tags",
        "goal_tags",
        "equipment_tags",
        "diabetes_type_tags",
    )
    def normalize_tag_list(cls, value: list[str]) -> list[str]:  # noqa: N805
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value or []:
            tag = str(item or "").strip().lower()
            if not tag or tag in seen:
                continue
            cleaned.append(tag)
            seen.add(tag)
        return cleaned

    @field_validator("cook_time_tag")
    def validate_cook_time_tag(cls, value: str | None) -> str | None:  # noqa: N805
        tag = str(value or "").strip().lower()
        if not tag:
            return None
        allowed = {"under_15", "15_30", "30_45", "45_plus"}
        if tag not in allowed:
            raise ValueError("cook_time_tag must be under_15, 15_30, 30_45, or 45_plus")
        return tag

    @field_validator("status")
    def validate_status(cls, value: str | None) -> str | None:  # noqa: N805
        status_value = str(value or "").strip().lower()
        if not status_value:
            return None
        allowed = {"draft", "published", "archived"}
        if status_value not in allowed:
            raise ValueError("status must be draft, published, or archived")
        return status_value


class RecipeGenerateDraftsPayload(BaseModel):
    count: int = Field(10, ge=1, le=30)
    meal_type: str | None = Field(None, max_length=20)
    cuisine_tags: list[str] = Field(default_factory=list, max_length=8)
    dietary_tags: list[str] = Field(default_factory=list, max_length=8)
    goal_tags: list[str] = Field(default_factory=list, max_length=8)
    diabetes_type_tags: list[str] = Field(default_factory=list, max_length=4)
    equipment_tags: list[str] = Field(default_factory=list, max_length=8)
    cook_time_tag: str | None = Field(None, max_length=30)
    notes: str | None = Field(None, max_length=600)

    @field_validator("meal_type")
    def validate_optional_meal_type(cls, value: str | None) -> str | None:  # noqa: N805
        normalized = str(value or "").strip().lower()
        if not normalized:
            return None
        if normalized not in {"breakfast", "lunch", "dinner", "snack"}:
            raise ValueError("meal_type must be breakfast, lunch, dinner, or snack")
        return normalized

    @field_validator("cuisine_tags", "dietary_tags", "goal_tags", "diabetes_type_tags", "equipment_tags")
    def normalize_generate_tags(cls, value: list[str]) -> list[str]:  # noqa: N805
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value or []:
            tag = str(item or "").strip().lower()
            if not tag or tag in seen:
                continue
            cleaned.append(tag)
            seen.add(tag)
        return cleaned

    @field_validator("cook_time_tag")
    def validate_generate_cook_time(cls, value: str | None) -> str | None:  # noqa: N805
        return RecipePayload.validate_cook_time_tag(value)


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


def _recipe_metadata_payload(recipe: Recipe) -> dict:
    return {
        "cuisine_tags": recipe.cuisine_tags or [],
        "dietary_tags": recipe.dietary_tags or [],
        "allergen_tags": recipe.allergen_tags or [],
        "food_exclusion_tags": recipe.food_exclusion_tags or [],
        "goal_tags": recipe.goal_tags or [],
        "equipment_tags": recipe.equipment_tags or [],
        "diabetes_type_tags": recipe.diabetes_type_tags or [],
        "cook_time_tag": recipe.cook_time_tag,
        "status": getattr(recipe, "status", None) or "published",
        "source": getattr(recipe, "source", None) or "manual",
        "image_prompt": getattr(recipe, "image_prompt", None),
        "safety_flags": getattr(recipe, "safety_flags", None) or [],
    }


# Recipe AI-generation helpers (prompt building, JSON parsing/repair, draft normalization,
# nutrition safety flags) live in recipe_generation_service so the manual "Generate Drafts"
# endpoint below and the scheduled auto-generation job share one implementation.


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
    nutrition = payload.nutrition.dict() if payload.nutrition else None
    safety_flags = _recipe_nutrition_safety_flags(payload.meal_type, nutrition)
    if (payload.status or "published") == "published" and _has_blocking_recipe_safety_flag(safety_flags):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recipe nutrition is not safe enough to publish. Fix the highlighted nutrition warnings first.",
        )
    recipe = Recipe(
        name=payload.name.strip(),
        meal_type=payload.meal_type,
        description=payload.description.strip() if payload.description else None,
        prep_time_minutes=payload.prep_time_minutes,
        cook_time_minutes=payload.cook_time_minutes,
        servings=payload.servings,
        image_url=str(payload.image_url).strip() if payload.image_url else None,
        image_prompt=payload.image_prompt.strip() if payload.image_prompt else None,
        ingredients=[item.dict() for item in payload.ingredients],
        instructions=payload.instructions,
        nutrition=nutrition,
        cuisine_tags=payload.cuisine_tags,
        dietary_tags=payload.dietary_tags,
        allergen_tags=payload.allergen_tags,
        food_exclusion_tags=payload.food_exclusion_tags,
        goal_tags=payload.goal_tags,
        equipment_tags=payload.equipment_tags,
        diabetes_type_tags=payload.diabetes_type_tags,
        cook_time_tag=payload.cook_time_tag,
        safety_flags=safety_flags,
        status=payload.status or "published",
        source="manual",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return {"id": recipe.id}


@router.get("/recipes")
def list_recipes(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    query = db.query(Recipe)
    if status_filter in {"draft", "published", "archived"}:
        query = query.filter(Recipe.status == status_filter)
    items = query.order_by(Recipe.created_at.desc()).all()
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
                **_recipe_metadata_payload(r),
            }
            for r in items
        ]
    }


def _batch_subscriptions_for_users(db: Session, user_ids: list[int]) -> tuple[dict[int, Subscription], dict[int, Subscription]]:
    """One query for the latest billing and admin-comp subscription per user, instead
    of the two extra per-user queries get_access_snapshot would otherwise run for each
    user - avoids the N+1 pattern in list_users/users_access_summary."""
    if not user_ids:
        return {}, {}
    subs = (
        db.query(Subscription)
        .filter(Subscription.user_id.in_(user_ids))
        .order_by(Subscription.user_id, Subscription.started_at.desc())
        .all()
    )
    latest_billing: dict[int, Subscription] = {}
    latest_comp: dict[int, Subscription] = {}
    for sub in subs:
        # Rows are ordered started_at desc within each user_id, so the first eligible
        # match encountered per user/category is the latest one - mirrors
        # get_latest_billing_subscription / get_latest_admin_comp exactly, including
        # SQL's NULL-excluding behavior for "store != admin" (None != "admin" is True
        # in plain Python, but NULL != 'admin' is unknown/excluded in SQL).
        if sub.user_id not in latest_billing and sub.store is not None and sub.store != "admin":
            latest_billing[sub.user_id] = sub
        if sub.user_id not in latest_comp and sub.store == "admin" and sub.plan == "premium":
            latest_comp[sub.user_id] = sub
    return latest_billing, latest_comp


def _admin_user_access_payload(
    db: Session,
    user: User,
    now: datetime | None = None,
    *,
    billing: Subscription | None = None,
    comp: Subscription | None = None,
    use_prefetched_subscriptions: bool = False,
) -> dict:
    now = now or datetime.utcnow()
    if getattr(user, "deleted_at", None):
        status_value = "deleted"
        return {
            "access_status": status_value,
            "access_label": ACCESS_STATUS_LABELS[status_value],
            "has_feature_access": False,
            "trial_active": False,
            "trial_started_at": user.trial_started_at,
            "trial_ends_at": user.trial_ends_at,
            "trial_grace_active": False,
            "trial_grace_ends_at": user.trial_grace_ends_at,
            "trial_days_left": 0,
        }

    blocked = is_premium_blocked(user, now=now)

    if user.suspended_at:
        status_value = "suspended"
        return {
            "access_status": status_value,
            "access_label": ACCESS_STATUS_LABELS[status_value],
            "has_feature_access": False,
            "trial_active": False,
            "trial_started_at": user.trial_started_at,
            "trial_ends_at": user.trial_ends_at,
            "trial_grace_active": False,
            "trial_grace_ends_at": user.trial_grace_ends_at,
            "trial_days_left": 0,
        }

    if blocked:
        status_value = "blocked"
        return {
            "access_status": status_value,
            "access_label": ACCESS_STATUS_LABELS[status_value],
            "has_feature_access": False,
            "trial_active": False,
            "trial_started_at": user.trial_started_at,
            "trial_ends_at": user.trial_ends_at,
            "trial_grace_active": False,
            "trial_grace_ends_at": user.trial_grace_ends_at,
            "trial_days_left": 0,
        }

    snapshot = (
        build_access_snapshot(user, billing, comp, now=now)
        if use_prefetched_subscriptions
        else get_access_snapshot(db, user, now=now)
    )
    return {
        "access_status": snapshot.access_status,
        "access_label": ACCESS_STATUS_LABELS.get(snapshot.access_status, snapshot.access_status),
        "has_feature_access": snapshot.allowed,
        "trial_active": snapshot.trial_active,
        "trial_started_at": user.trial_started_at,
        "trial_ends_at": snapshot.trial_ends_at,
        "trial_grace_active": snapshot.trial_grace_active,
        "trial_grace_ends_at": snapshot.trial_grace_ends_at,
        "trial_days_left": snapshot.trial_days_left,
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
    include_deleted: bool = False,
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

    tier_key = (tier or "").lower()
    if tier_key == "trial":
        tier_key = "trialing"
    elif tier_key == "grace":
        tier_key = "legacy_grace"

    if not include_deleted and tier_key != "deleted":
        query = query.filter(User.deleted_at.is_(None))

    if q:
        search = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(User.email).like(search)
            | func.lower(func.coalesce(User.full_name, "")).like(search)
        )

    now = datetime.utcnow()
    billing_status = func.lower(func.coalesce(billing_sub_join.c.status, ""))
    comp_status = func.lower(func.coalesce(comp_sub_join.c.status, ""))
    billing_has_access_status = billing_status.in_(["active", "trialing"])
    billing_cancelled_active = and_(
        billing_status.in_(["cancelled", "canceled"]),
        billing_sub_join.c.expires_at.is_not(None),
        billing_sub_join.c.expires_at > now,
    )
    billing_active = and_(
        billing_sub_join.c.status.is_not(None),
        or_(billing_has_access_status, billing_cancelled_active),
        or_(billing_sub_join.c.expires_at.is_(None), billing_sub_join.c.expires_at > now),
    )
    billing_trialing = and_(
        billing_status == "trialing",
        billing_sub_join.c.expires_at.is_not(None),
        billing_sub_join.c.expires_at > now,
    )
    comp_active = and_(
        comp_sub_join.c.status.is_not(None),
        comp_status == "active",
        or_(comp_sub_join.c.expires_at.is_(None), comp_sub_join.c.expires_at > now),
    )
    not_blocked = or_(
        User.premium_access_blocked_at.is_(None),
        and_(User.premium_access_blocked_until.is_not(None), User.premium_access_blocked_until <= now),
    )
    effective_premium = and_(not_blocked, or_(billing_active, comp_active))
    active_block = ~not_blocked
    legacy_grace_active = and_(User.trial_grace_ends_at.is_not(None), User.trial_grace_ends_at > now)
    legacy_grace_inactive = or_(User.trial_grace_ends_at.is_(None), User.trial_grace_ends_at <= now)
    normal_non_premium = and_(~effective_premium, User.suspended_at.is_(None), not_blocked)

    if tier_key in {"free", "premium", "trialing", "cancelled_active", "legacy_grace", "expired", "blocked", "suspended", "deleted"}:
        if tier_key == "deleted":
            query = query.filter(User.deleted_at.is_not(None))
        elif tier_key == "premium":
            query = query.filter(effective_premium, User.suspended_at.is_(None))
        elif tier_key == "free":
            query = query.filter(normal_non_premium, legacy_grace_inactive, User.trial_started_at.is_(None))
        elif tier_key == "trialing":
            query = query.filter(effective_premium, billing_trialing, User.suspended_at.is_(None))
        elif tier_key == "cancelled_active":
            query = query.filter(effective_premium, billing_cancelled_active, User.suspended_at.is_(None))
        elif tier_key == "legacy_grace":
            query = query.filter(normal_non_premium, legacy_grace_active)
        elif tier_key == "expired":
            query = query.filter(normal_non_premium, legacy_grace_inactive, User.trial_started_at.is_not(None))
        elif tier_key == "blocked":
            query = query.filter(active_block, User.suspended_at.is_(None))
        elif tier_key == "suspended":
            query = query.filter(User.suspended_at.is_not(None))

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

    page_user_ids = [row[0].id for row in rows]
    billing_by_user, comp_by_user = _batch_subscriptions_for_users(db, page_user_ids)

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
        billing_status_key = (billing_status_value or "").lower()
        comp_status_key = (comp_status_value or "").lower()
        billing_is_active = (
            (
                billing_status_key in {"active", "trialing"}
                or (
                    billing_status_key in {"cancelled", "canceled"}
                    and billing_expires_value is not None
                    and billing_expires_value > now
                )
            )
            and (billing_expires_value is None or billing_expires_value > now)
        )
        comp_is_active = (
            comp_status_key == "active"
            and (comp_expires_value is None or comp_expires_value > now)
        )
        is_premium = (not blocked) and (billing_is_active or comp_is_active)
        status_label = "active" if is_premium else "inactive"
        expires_at = billing_expires_value if billing_is_active else comp_expires_value if comp_is_active else None
        tier_source = "blocked" if blocked else "store" if billing_is_active else "admin_comp" if comp_is_active else "free"
        access_payload = _admin_user_access_payload(
            db,
            user,
            now=now,
            billing=billing_by_user.get(user.id),
            comp=comp_by_user.get(user.id),
            use_prefetched_subscriptions=True,
        )
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
                "deleted_at": user.deleted_at,
                "deleted_by_admin_id": user.deleted_by_admin_id,
                "delete_reason": user.delete_reason,
                "permanent_delete_at": permanent_delete_at(user),
                **access_payload,
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


@router.get("/users/platform-summary")
def users_platform_summary(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    return _get_user_platform_counts(db)


@router.get("/users/access-summary")
def users_access_summary(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    now = datetime.utcnow()
    counts = {
        "trialing": 0,
        "cancelled_active": 0,
        "legacy_grace": 0,
        "free": 0,
        "expired": 0,
        "premium": 0,
        "blocked": 0,
        "suspended": 0,
        "deleted": 0,
        "total": 0,
    }
    all_users = db.query(User).all()
    billing_by_user, comp_by_user = _batch_subscriptions_for_users(db, [u.id for u in all_users])
    for user in all_users:
        payload = _admin_user_access_payload(
            db,
            user,
            now=now,
            billing=billing_by_user.get(user.id),
            comp=comp_by_user.get(user.id),
            use_prefetched_subscriptions=True,
        )
        status_value = payload.get("access_status")
        if status_value == "expired":
            bucket = "free" if user.trial_started_at is None else "expired"
            counts[bucket] += 1
        elif status_value in counts:
            counts[status_value] += 1
        elif status_value == "trial":
            counts["trialing"] += 1
        elif status_value == "grace":
            counts["legacy_grace"] += 1
        counts["total"] += 1
    return counts


def _get_user_platform_counts(db: Session) -> dict:
    rows = (
        db.query(func.lower(func.coalesce(User.registered_platform, "unknown")).label("platform"), func.count(User.id).label("total"))
        .filter(User.deleted_at.is_(None))
        .group_by(func.lower(func.coalesce(User.registered_platform, "unknown")))
        .all()
    )
    counts = {"ios": 0, "android": 0, "unknown": 0}
    for platform, total in rows:
        key = str(platform or "unknown").strip().lower()
        if key not in {"ios", "android"}:
            key = "unknown"
        counts[key] = counts.get(key, 0) + int(total or 0)
    return {"ios": counts.get("ios", 0), "android": counts.get("android", 0), "unknown": counts.get("unknown", 0), "total": sum(counts.values())}


def _count_users_between(users: list[User], start: datetime, end: datetime) -> int:
    total = 0
    for user in users:
        created_at = user.created_at
        if created_at and start <= created_at < end:
            total += 1
    return total


@router.get("/users/growth")
def users_growth(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    return _build_user_growth_payload(db)


@router.get("/dashboard/user-metrics")
def staff_dashboard_user_metrics(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),  # noqa: ARG001
):
    return {
        "growth": _build_user_growth_payload(db),
        "downloads": _get_user_platform_counts(db),
    }


def _build_user_growth_payload(db: Session) -> dict:
    now = datetime.utcnow()
    today = now.date()

    # Sunday-to-Saturday week. Python weekday: Monday=0, Sunday=6.
    days_since_sunday = (today.weekday() + 1) % 7
    week_start_date = today - timedelta(days=days_since_sunday)
    week_start = datetime.combine(week_start_date, datetime.min.time())
    week_end = week_start + timedelta(days=7)

    month_start = datetime(now.year, now.month, 1)
    month_end = datetime(now.year + 1, 1, 1) if now.month == 12 else datetime(now.year, now.month + 1, 1)

    year_start = datetime(now.year, 1, 1)
    year_end = datetime(now.year + 1, 1, 1)

    query_start = min(week_start, year_start)
    users = (
        db.query(User)
        .filter(User.deleted_at.is_(None), User.created_at >= query_start, User.created_at < year_end)
        .all()
    )

    week_items = []
    for index in range(7):
        bucket_start = week_start + timedelta(days=index)
        bucket_end = bucket_start + timedelta(days=1)
        week_items.append(
            {
                "key": bucket_start.strftime("%Y-%m-%d"),
                "label": bucket_start.strftime("%a"),
                "count": _count_users_between(users, bucket_start, bucket_end),
            }
        )

    month_items = []
    cursor = month_start
    while cursor < month_end:
        bucket_end = cursor + timedelta(days=1)
        month_items.append(
            {
                "key": cursor.strftime("%Y-%m-%d"),
                "label": cursor.strftime("%b %d"),
                "count": _count_users_between(users, cursor, bucket_end),
            }
        )
        cursor = bucket_end

    year_items = []
    for month_index in range(1, 13):
        bucket_start = datetime(now.year, month_index, 1)
        bucket_end = datetime(now.year + 1, 1, 1) if month_index == 12 else datetime(now.year, month_index + 1, 1)
        year_items.append(
            {
                "key": bucket_start.strftime("%Y-%m"),
                "label": bucket_start.strftime("%b"),
                "count": _count_users_between(users, bucket_start, bucket_end),
            }
        )

    return {
        "generated_at": now.isoformat(),
        "week": {
            "label": "Current week",
            "starts_on": "Sunday",
            "start": week_start.isoformat(),
            "end": week_end.isoformat(),
            "items": week_items,
        },
        "month": {
            "label": month_start.strftime("%B %Y"),
            "start": month_start.isoformat(),
            "end": month_end.isoformat(),
            "items": month_items,
        },
        "year": {
            "label": str(now.year),
            "start": year_start.isoformat(),
            "end": year_end.isoformat(),
            "items": year_items,
        },
    }


@router.get("/users/export.xls")
def export_users_excel(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    users = db.query(User).filter(User.deleted_at.is_(None)).order_by(User.created_at.desc(), User.id.desc()).all()
    rows = [
        "<tr><th>User name</th><th>Email</th><th>Date joined</th></tr>",
    ]
    for user in users:
        rows.append(
            "<tr>"
            f"<td>{html.escape(str(user.full_name or ''))}</td>"
            f"<td>{html.escape(str(user.email or ''))}</td>"
            f"<td>{html.escape(user.created_at.strftime('%Y-%m-%d') if user.created_at else '')}</td>"
            "</tr>"
        )
    content = (
        "<html><head><meta charset=\"utf-8\" /></head><body>"
        "<table border=\"1\">"
        + "".join(rows)
        + "</table></body></html>"
    )
    return Response(
        content=content,
        media_type="application/vnd.ms-excel; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="glucoforager_users.xls"'},
    )


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
    access_payload = _admin_user_access_payload(db, user, now=now)
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
        "deleted_at": user.deleted_at,
        "deleted_by_admin_id": user.deleted_by_admin_id,
        "delete_reason": user.delete_reason,
        "permanent_delete_at": permanent_delete_at(user),
        **access_payload,
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

    now = datetime.utcnow()
    if user.deleted_at:
        return {"status": "deleted", "soft_deleted": True}

    db.query(PushToken).filter(PushToken.user_id == user.id).delete(synchronize_session=False)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete(synchronize_session=False)
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update(
        {RefreshToken.revoked_at: now},
        synchronize_session=False,
    )
    user.deleted_at = now
    user.deleted_by_admin_id = current_admin.id
    user.delete_reason = "Deleted by admin"
    if not user.suspended_at:
        user.suspended_at = now
        user.suspended_reason = "Deleted by admin"
    db.commit()
    return {"status": "deleted", "soft_deleted": True}


@router.post("/users/{user_id}/restore")
def restore_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.deleted_at:
        return {"status": "active", "restored": False}

    user.deleted_at = None
    user.deleted_by_admin_id = None
    user.delete_reason = None
    if user.suspended_reason == "Deleted by admin":
        user.suspended_at = None
        user.suspended_reason = None
    db.commit()
    return {"status": "restored", "restored": True}


@router.delete("/users/{user_id}/permanent")
def permanently_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.deleted_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Soft delete the user before permanently deleting them.")

    hard_delete_user(db, user)
    db.commit()
    return {"status": "permanently_deleted"}
@router.post("/recipes/generate-drafts")
def generate_recipe_drafts(
    payload: RecipeGenerateDraftsPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    params = RecipeGenerationParams(
        count=payload.count,
        meal_type=payload.meal_type,
        cuisine_tags=payload.cuisine_tags,
        dietary_tags=payload.dietary_tags,
        goal_tags=payload.goal_tags,
        diabetes_type_tags=payload.diabetes_type_tags,
        equipment_tags=payload.equipment_tags,
        cook_time_tag=payload.cook_time_tag,
        notes=payload.notes,
    )
    try:
        return generate_recipe_draft_batch(db, params, generated_by_admin_user_id=current_admin.id)
    except RecipeGenerationError as exc:
        message = str(exc)
        status_code = (
            status.HTTP_503_SERVICE_UNAVAILABLE
            if "not configured" in message
            else status.HTTP_502_BAD_GATEWAY
        )
        raise HTTPException(status_code=status_code, detail=message) from exc


class RecipeBulkPublishPayload(BaseModel):
    recipe_ids: list[int] = Field(..., min_length=1, max_length=200)


@router.post("/recipes/bulk-publish")
def bulk_publish_recipes(
    payload: RecipeBulkPublishPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    published: list[int] = []
    failed: list[dict] = []
    now = datetime.utcnow()
    for recipe_id in payload.recipe_ids:
        recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
        if not recipe:
            failed.append({"id": recipe_id, "reason": "Recipe not found"})
            continue
        if not str(recipe.image_url or "").strip():
            failed.append({"id": recipe_id, "name": recipe.name, "reason": "Upload an image before publishing this recipe."})
            continue
        safety_flags = _recipe_nutrition_safety_flags(recipe.meal_type, recipe.nutrition)
        recipe.safety_flags = safety_flags
        if _has_blocking_recipe_safety_flag(safety_flags):
            messages = [str(item.get("message") or item.get("code") or "Nutrition warning") for item in safety_flags if isinstance(item, dict) and item.get("level") == "danger"]
            failed.append({"id": recipe_id, "name": recipe.name, "reason": " ".join(messages[:2]) or "Nutrition is not safe enough to publish."})
            continue
        recipe.status = "published"
        recipe.updated_at = now
        published.append(recipe_id)
    db.commit()
    return {"published": published, "published_count": len(published), "failed": failed}


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
        **_recipe_metadata_payload(recipe),
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
    recipe.image_url = str(payload.image_url).strip() if payload.image_url else None
    recipe.image_prompt = payload.image_prompt.strip() if payload.image_prompt else None
    recipe.ingredients = [item.dict() for item in payload.ingredients]
    recipe.instructions = payload.instructions
    nutrition = payload.nutrition.dict() if payload.nutrition else None
    safety_flags = _recipe_nutrition_safety_flags(payload.meal_type, nutrition)
    requested_status = payload.status or recipe.status or "draft"
    if requested_status == "published" and _has_blocking_recipe_safety_flag(safety_flags):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recipe nutrition is not safe enough to publish. Fix the highlighted nutrition warnings first.",
        )
    recipe.nutrition = nutrition
    recipe.cuisine_tags = payload.cuisine_tags
    recipe.dietary_tags = payload.dietary_tags
    recipe.allergen_tags = payload.allergen_tags
    recipe.food_exclusion_tags = payload.food_exclusion_tags
    recipe.goal_tags = payload.goal_tags
    recipe.equipment_tags = payload.equipment_tags
    recipe.diabetes_type_tags = payload.diabetes_type_tags
    recipe.cook_time_tag = payload.cook_time_tag
    recipe.safety_flags = safety_flags
    if payload.status:
        recipe.status = payload.status
    recipe.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "updated"}


@router.post("/recipes/{recipe_id}/publish")
def publish_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    if not str(recipe.image_url or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload an image before publishing this recipe.")
    safety_flags = _recipe_nutrition_safety_flags(recipe.meal_type, recipe.nutrition)
    recipe.safety_flags = safety_flags
    if _has_blocking_recipe_safety_flag(safety_flags):
        messages = [str(item.get("message") or item.get("code") or "Nutrition warning") for item in safety_flags if isinstance(item, dict) and item.get("level") == "danger"]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recipe nutrition is not safe enough to publish. " + " ".join(messages[:2]),
        )
    recipe.status = "published"
    recipe.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "published"}


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


@router.get("/ai/usage-guardrails")
def ai_usage_guardrails(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    guardrails = get_ai_guardrail_settings(db)

    by_type_rows = (
        db.query(
            AIRequest.request_type,
            func.count(AIRequest.id),
            func.coalesce(func.sum(AIRequest.tokens_used), 0),
            func.coalesce(func.sum(AIRequest.cost_estimate), 0),
        )
        .filter(AIRequest.created_at >= today_start)
        .group_by(AIRequest.request_type)
        .all()
    )
    by_type = [
        {
            "request_type": row[0],
            "count": int(row[1] or 0),
            "tokens": int(row[2] or 0),
            "cost_estimate": float(row[3] or 0),
        }
        for row in by_type_rows
    ]

    top_rows = (
        db.query(
            AIRequest.user_id,
            User.email,
            User.full_name,
            AIRequest.tier,
            func.count(AIRequest.id).label("request_count"),
            func.coalesce(func.sum(AIRequest.tokens_used), 0).label("tokens"),
        )
        .join(User, User.id == AIRequest.user_id)
        .filter(AIRequest.created_at >= today_start)
        .group_by(AIRequest.user_id, User.email, User.full_name, AIRequest.tier)
        .order_by(func.count(AIRequest.id).desc())
        .limit(15)
        .all()
    )
    top_users = [
        {
            "user_id": int(row[0]),
            "email": row[1],
            "full_name": row[2],
            "tier": row[3],
            "request_count": int(row[4] or 0),
            "tokens": int(row[5] or 0),
        }
        for row in top_rows
    ]

    queued_rows = (
        db.query(AIJob.source, AIJob.status, func.count(AIJob.id))
        .filter(AIJob.created_at >= today_start)
        .group_by(AIJob.source, AIJob.status)
        .all()
    )
    queued = [
        {"source": row[0], "status": row[1], "count": int(row[2] or 0)}
        for row in queued_rows
    ]

    return {
        "generated_at": now.isoformat() + "Z",
        "limits": {
            "burst_per_minute": {
                "free_text": guardrails.free_text_per_minute,
                "premium_text": guardrails.premium_text_per_minute,
                "free_vision": guardrails.free_vision_per_minute,
                "premium_vision": guardrails.premium_vision_per_minute,
            },
            "daily": {
                "free_agent": guardrails.free_agent_daily,
                "premium_agent": guardrails.premium_agent_daily,
                "premium_recipes": guardrails.premium_recipes_daily,
                "free_swaps": guardrails.free_swaps_daily,
                "premium_swaps": guardrails.premium_swaps_daily,
                "premium_daily_plan": guardrails.premium_daily_plan_daily,
            },
            "weekly": {
                "free_daily_plan": guardrails.free_daily_plan_weekly,
            },
        },
        "today": {
            "by_type": by_type,
            "top_users": top_users,
            "queued_jobs": queued,
        },
    }


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
        log_system_event({
            "timestamp": datetime.utcnow().isoformat(),
            "level": "error",
            "source": "admin.uploads",
            "message": "Recipe image upload failed (config)",
            "details": str(e),
            "filename": file.filename,
        })
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception as e:
        logger.exception("Recipe image upload failed")
        log_system_event({
            "timestamp": datetime.utcnow().isoformat(),
            "level": "error",
            "source": "admin.uploads",
            "message": "Recipe image upload failed",
            "details": f"{type(e).__name__}: {e}",
            "filename": file.filename,
        })
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Upload failed: {e}")

    return {"url": url}
