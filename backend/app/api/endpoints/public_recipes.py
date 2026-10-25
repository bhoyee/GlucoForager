"""Public recipe pages for the website (glucoforager.com/recipes) - no sign-in.

Only recipes good enough to represent the app are public: published, not hidden by an
admin (web_hidden), with a photo, full nutrition, at least 3 ingredients and 3 steps,
and no high-carb / high-sugar / blocking safety warning. Everything else stays app-only.

URLs are /recipes/<slug>-<id>: the id finds the recipe, the slug is for people and Google.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.recipe import Recipe
from ...services.cache_service import CacheService

router = APIRouter(prefix="/public/recipes", tags=["public-recipes"])
cache = CacheService()

CACHE_TTL = 600
MEAL_TYPES = ("breakfast", "lunch", "dinner", "snack")
QUICK_FILTERS = ("low_carb", "under_20", "high_protein", "vegetarian")
EXCLUDED_FLAG_CODES = {"high_carbs", "high_sugar"}


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return text[:80].rstrip("-") or "recipe"


def recipe_slug(recipe: Recipe) -> str:
    return f"{slugify(recipe.name)}-{recipe.id}"


def _num(value) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _tags(recipe: Recipe, field: str) -> list[str]:
    raw = getattr(recipe, field, None)
    return [str(t).strip().lower() for t in raw if isinstance(t, str) and t.strip()] if isinstance(raw, list) else []


def _public_query(db: Session):
    return db.query(Recipe).filter(
        Recipe.status == "published",
        Recipe.web_hidden.is_(False),
        func.coalesce(Recipe.image_url, "") != "",
        Recipe.nutrition["carbs"].isnot(None),
        Recipe.nutrition["calories"].isnot(None),
        func.json_array_length(Recipe.ingredients) >= 3,
        func.json_array_length(Recipe.instructions) >= 3,
    )


def is_public_quality(recipe: Recipe) -> bool:
    for flag in recipe.safety_flags or []:
        if isinstance(flag, dict) and (flag.get("code") in EXCLUDED_FLAG_CODES or flag.get("level") == "danger"):
            return False
    return _num((recipe.nutrition or {}).get("carbs")) is not None


def _total_minutes(recipe: Recipe) -> int:
    return int(recipe.prep_time_minutes or 0) + int(recipe.cook_time_minutes or 0)


def _ingredients(recipe: Recipe) -> list[dict]:
    items = []
    for raw in recipe.ingredients or []:
        if isinstance(raw, str):
            items.append({"name": raw.strip(), "quantity": None, "unit": None, "note": None})
        elif isinstance(raw, dict) and str(raw.get("name") or "").strip():
            items.append({
                "name": str(raw.get("name")).strip(),
                "quantity": raw.get("quantity"),
                "unit": (str(raw.get("unit")).strip() or None) if raw.get("unit") else None,
                "note": (str(raw.get("note")).strip() or None) if raw.get("note") else None,
            })
    return items


def _steps(recipe: Recipe) -> list[str]:
    steps = []
    for raw in recipe.instructions or []:
        text = raw if isinstance(raw, str) else (raw.get("text") or raw.get("step") if isinstance(raw, dict) else None)
        if text and str(text).strip():
            steps.append(str(text).strip())
    return steps


def _nutrition(recipe: Recipe) -> dict:
    n = recipe.nutrition or {}
    return {k: _num(n.get(k)) for k in ("calories", "carbs", "protein", "fat", "fiber", "sugar")}


def _card(recipe: Recipe) -> dict:
    n = _nutrition(recipe)
    return {
        "id": recipe.id,
        "slug": recipe_slug(recipe),
        "name": recipe.name,
        "description": recipe.description,
        "meal_type": recipe.meal_type,
        "image_url": recipe.image_url,
        "total_minutes": _total_minutes(recipe) or None,
        "carbs": n["carbs"],
        "calories": n["calories"],
        "protein": n["protein"],
        "dietary_tags": _tags(recipe, "dietary_tags"),
    }


def _matches_quick(recipe: Recipe, quick: set[str]) -> bool:
    n = _nutrition(recipe)
    if "low_carb" in quick and (n["carbs"] is None or n["carbs"] > 30):
        return False
    if "high_protein" in quick and (n["protein"] is None or n["protein"] < 20):
        return False
    if "under_20" in quick and not (0 < _total_minutes(recipe) <= 20):
        return False
    if "vegetarian" in quick and "vegetarian" not in _tags(recipe, "dietary_tags") and "vegan" not in _tags(recipe, "dietary_tags"):
        return False
    return True


def _all_public(db: Session) -> list[Recipe]:
    rows = _public_query(db).order_by(Recipe.id.desc()).all()
    return [r for r in rows if is_public_quality(r)]


@router.get("")
def list_public_recipes(
    meal_type: str | None = Query(None),
    quick: str | None = Query(None, description="Comma list: low_carb, under_20, high_protein, vegetarian"),
    q: str | None = Query(None, max_length=60),
    page: int = Query(1, ge=1, le=200),
    page_size: int = Query(24, ge=1, le=48),
    db: Session = Depends(get_db),
):
    meal = meal_type.lower() if meal_type and meal_type.lower() in MEAL_TYPES else None
    quick_set = {x.strip() for x in str(quick or "").split(",") if x.strip() in QUICK_FILTERS}
    term = " ".join(str(q or "").split())[:60].lower()
    key = f"public_recipes:list:v1:{meal}:{','.join(sorted(quick_set))}:{term}:{page}:{page_size}"
    cached = cache.get(key)
    if cached:
        return cached

    rows = [
        r for r in _all_public(db)
        if (not meal or r.meal_type == meal) and _matches_quick(r, quick_set) and (not term or term in r.name.lower())
    ]
    start = (page - 1) * page_size
    result = {
        "total": len(rows),
        "page": page,
        "page_size": page_size,
        "items": [_card(r) for r in rows[start:start + page_size]],
    }
    cache.set(key, result, ttl_seconds=CACHE_TTL)
    return result


@router.get("/sitemap")
def public_recipe_sitemap(db: Session = Depends(get_db)):
    cached = cache.get("public_recipes:sitemap:v1")
    if cached:
        return cached
    result = {
        "items": [
            {"slug": recipe_slug(r), "updated_at": (r.updated_at or r.created_at or datetime.utcnow()).isoformat()}
            for r in _all_public(db)
        ]
    }
    cache.set("public_recipes:sitemap:v1", result, ttl_seconds=CACHE_TTL)
    return result


@router.get("/{slug}")
def get_public_recipe(slug: str, db: Session = Depends(get_db)):
    match = re.search(r"(\d+)$", slug or "")
    if not match:
        raise HTTPException(status_code=404, detail="Recipe not found")
    recipe_id = int(match.group(1))
    key = f"public_recipes:detail:v1:{recipe_id}"
    cached = cache.get(key)
    if cached:
        return cached

    recipe = _public_query(db).filter(Recipe.id == recipe_id).first()
    if not recipe or not is_public_quality(recipe):
        raise HTTPException(status_code=404, detail="Recipe not found")

    related_rows = [
        r for r in _public_query(db).filter(Recipe.meal_type == recipe.meal_type, Recipe.id != recipe.id)
        .order_by(func.abs(Recipe.id - recipe.id)).limit(12).all()
        if is_public_quality(r)
    ][:4]
    result = {
        **_card(recipe),
        "prep_minutes": recipe.prep_time_minutes,
        "cook_minutes": recipe.cook_time_minutes,
        "servings": recipe.servings,
        "nutrition": _nutrition(recipe),
        "ingredients": _ingredients(recipe),
        "steps": _steps(recipe),
        "cuisine_tags": _tags(recipe, "cuisine_tags"),
        "goal_tags": _tags(recipe, "goal_tags"),
        "updated_at": (recipe.updated_at or recipe.created_at or datetime.utcnow()).isoformat(),
        "created_at": (recipe.created_at or datetime.utcnow()).isoformat(),
        "related": [_card(r) for r in related_rows],
    }
    cache.set(key, result, ttl_seconds=CACHE_TTL)
    return result
