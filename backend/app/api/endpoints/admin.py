import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, EmailStr, Field, HttpUrl, validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...core.config import settings
from ...core.security import create_access_token, get_password_hash, verify_password
from ...database import get_db
from ...models.admin_user import AdminUser
from ...models.ai_job import AIJob
from ...models.ai_request import AIRequest
from ...models.favorite import Favorite
from ...models.meal_plan import MealPlan
from ...models.password_reset import PasswordResetToken
from ...models.recipe import Recipe
from ...models.recipe_history import RecipeHistory
from ...models.shopping_item import ShoppingItem
from ...models.subscription import Subscription
from ...models.user import SearchLog, User
from ...models.subscription import Subscription
from ...models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])


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

    @validator("meal_type")
    def validate_meal_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed = {"breakfast", "lunch", "dinner", "snack"}
        if normalized not in allowed:
            raise ValueError("meal_type must be breakfast, lunch, dinner, or snack")
        return normalized

    @validator("instructions")
    def validate_instructions(cls, value: list[str]) -> list[str]:
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

    @validator("tier")
    def validate_tier(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"free", "premium"}:
            raise ValueError("tier must be free or premium")
        return normalized


@router.post("/login", response_model=AdminToken)
def admin_login(payload: AdminLoginPayload, db: Session = Depends(get_db)):
    admin = db.query(AdminUser).filter(AdminUser.email == payload.email.lower()).first()
    if not admin or not verify_password(payload.password, admin.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
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

    latest_sub = (
        db.query(
            Subscription.user_id.label("user_id"),
            func.max(Subscription.started_at).label("max_started_at"),
        )
        .group_by(Subscription.user_id)
        .subquery()
    )
    latest_sub_join = (
        db.query(Subscription)
        .join(
            latest_sub,
            (Subscription.user_id == latest_sub.c.user_id)
            & (Subscription.started_at == latest_sub.c.max_started_at),
        )
        .subquery()
    )

    query = (
        db.query(
            User,
            latest_sub_join.c.status.label("sub_status"),
            latest_sub_join.c.expires_at.label("sub_expires_at"),
        )
        .outerjoin(latest_sub_join, User.id == latest_sub_join.c.user_id)
    )

    if q:
        search = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(User.email).like(search)
            | func.lower(func.coalesce(User.full_name, "")).like(search)
        )

    if tier in {"free", "premium"}:
        query = query.filter(User.subscription_tier == tier)

    now = datetime.utcnow()
    if status_filter in {"active", "inactive"}:
        if status_filter == "active":
            query = query.filter(
                User.subscription_tier == "premium",
                (latest_sub_join.c.status == "active"),
                (
                    (latest_sub_join.c.expires_at.is_(None))
                    | (latest_sub_join.c.expires_at > now)
                ),
            )
        else:
            query = query.filter(
                or_(
                    User.subscription_tier != "premium",
                    latest_sub_join.c.status.is_(None),
                    latest_sub_join.c.status != "active",
                    (
                        latest_sub_join.c.expires_at.is_not(None)
                        & (latest_sub_join.c.expires_at <= now)
                    ),
                ),
            )

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
    for user, sub_status, sub_expires in rows:
        is_premium = user.subscription_tier == "premium"
        is_active = (
            is_premium
            and (sub_status == "active")
            and (sub_expires is None or sub_expires > now)
        )
        status_label = "active" if is_active else "inactive"
        items.append(
            {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "subscription_tier": user.subscription_tier or "free",
                "subscription_status": sub_status,
                "expires_at": sub_expires,
                "status": status_label,
                "suspended_at": user.suspended_at,
                "suspended_reason": user.suspended_reason,
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
    latest = subs[0] if subs else None
    now = datetime.utcnow()
    status_label = "inactive"
    expires_at = latest.expires_at if latest else None
    if user.subscription_tier == "premium" and latest:
        if latest.status == "active" and (latest.expires_at is None or latest.expires_at > now):
            status_label = "active"
    return {
        "id": user.id,
        "public_id": user.public_id,
        "email": user.email,
        "full_name": user.full_name,
        "gender": user.gender,
        "country": user.country,
        "subscription_tier": user.subscription_tier or "free",
        "status": status_label,
        "expires_at": expires_at,
        "suspended_at": user.suspended_at,
        "suspended_reason": user.suspended_reason,
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
        user.subscription_tier = "premium"
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
    else:
        user.subscription_tier = "free"
        db.query(Subscription).filter(
            Subscription.user_id == user.id,
            Subscription.status == "active",
        ).update({Subscription.status: "inactive", Subscription.expires_at: now})

    db.commit()
    return {"status": "updated", "tier": user.subscription_tier}


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
    db.query(RecipeHistory).filter(RecipeHistory.user_id == user.id).delete(synchronize_session=False)
    db.query(ShoppingItem).filter(ShoppingItem.user_id == user.id).delete(synchronize_session=False)
    db.query(Subscription).filter(Subscription.user_id == user.id).delete(synchronize_session=False)
    db.query(SearchLog).filter(SearchLog.user_id == user.id).delete(synchronize_session=False)
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
    db: Session = Depends(get_db),
):
    """
    One-time bootstrap to create the first admin user.
    Only allowed if no admin users exist.
    """
    existing_admin = db.query(AdminUser).first()
    if existing_admin:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin already exists")
    admin = AdminUser(email=payload.email.lower(), hashed_password=get_password_hash(payload.password))
    db.add(admin)
    db.commit()
    return {"status": "created"}


@router.get("/status")
def admin_status(db: Session = Depends(get_db)):
    return {"has_admin": db.query(AdminUser).first() is not None}


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

    os.makedirs(settings.uploads_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    destination = os.path.join(settings.uploads_dir, filename)

    with open(destination, "wb") as target:
        target.write(file.file.read())

    base_url = str(request.base_url).rstrip("/")
    return {"url": f"{base_url}/uploads/{filename}"}
