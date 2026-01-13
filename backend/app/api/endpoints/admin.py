import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, EmailStr, Field, HttpUrl, validator
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...core.config import settings
from ...core.security import create_access_token, get_password_hash, verify_password
from ...database import get_db
from ...models.admin_user import AdminUser
from ...models.recipe import Recipe

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
