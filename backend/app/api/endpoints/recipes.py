import random

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.recipe import Recipe
from ...models.recipe_history import RecipeHistory
from ...models.user import User
from ..dependencies import get_current_user
from ...services.cache_service import CacheService
import hashlib

router = APIRouter(prefix="/recipes", tags=["recipes"])
cache = CacheService()


def _ai_recipe_fingerprint(item: dict) -> str:
    title = str(item.get("title") or item.get("name") or "").strip().lower()
    raw_ingredients = item.get("ingredients") or []
    names: list[str] = []
    if isinstance(raw_ingredients, list):
        for ing in raw_ingredients:
            if isinstance(ing, str):
                if ing.strip():
                    names.append(ing.strip())
            elif isinstance(ing, dict):
                name = str(ing.get("name") or ing.get("title") or "").strip()
                if name:
                    names.append(name)
    normalized = ",".join(sorted({name.strip().lower() for name in names if name.strip()}))
    return hashlib.sha256((title + "|" + normalized).encode("utf-8")).hexdigest()


@router.get("/legacy")
def legacy_notice():
    return {"detail": "Legacy recipe search removed; use /api/ai/recipes/vision or /api/ai/text/recipes"}


@router.get("/suggestions")
def recipe_suggestions(
    meal_type: str | None = None,
    limit: int = 3,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Recipe)
    if meal_type:
        query = query.filter(Recipe.meal_type == meal_type.lower())
    items = query.all()
    if not items:
        return {"items": []}
    limit = max(1, min(limit, 6))
    selection = random.sample(items, k=min(limit, len(items)))
    return {
        "items": [
            {
                "id": r.id,
                "name": r.name,
                "meal_type": r.meal_type,
                "description": r.description,
                "prep_time_minutes": r.prep_time_minutes,
                "cook_time_minutes": r.cook_time_minutes,
                "servings": r.servings,
                "image_url": r.image_url,
                "nutrition": r.nutrition,
            }
            for r in selection
        ]
    }


@router.get("/recent")
def recent_recipes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    latest = (
        db.query(RecipeHistory)
        .filter(RecipeHistory.user_id == current_user.id)
        .order_by(RecipeHistory.created_at.desc())
        .first()
    )
    if not latest:
        return {"items": []}
    recipes = latest.recipes or []

    # Overlay generated images (if any) using our cache mapping from image generation.
    # This makes the client "Recent recipes" reflect images even if the stored JSON still contains placeholders.
    if isinstance(recipes, list):
        for recipe in recipes:
            if not isinstance(recipe, dict):
                continue
            fingerprint = _ai_recipe_fingerprint(recipe)
            url = cache.get(f"recipeimg:{fingerprint}:url")
            if url and isinstance(url, str):
                recipe["image_url"] = url
                recipe["image_source"] = "ai"
    return {"items": recipes[:3]}


@router.get("/{recipe_id}")
def get_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    }
