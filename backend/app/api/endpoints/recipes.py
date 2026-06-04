import random
import re
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.recipe import Recipe
from ...models.recipe_history import RecipeHistory
from ...models.user import User
from ..dependencies import get_current_user
from ...services.cache_service import CacheService
from ...services.food_profile_service import extract_food_profile
from ...services.recipe_fingerprint import recipe_fingerprint as stable_recipe_fingerprint
from ...services.recipe_image_attach_service import attach_recipe_images

router = APIRouter(prefix="/recipes", tags=["recipes"])
cache = CacheService()


def _ai_recipe_fingerprint(item: dict) -> str:
    title = str(item.get("title") or item.get("name") or "").strip()
    raw_ingredients = item.get("ingredients") or []
    names: list[str] = []
    if isinstance(raw_ingredients, list):
        for ing in raw_ingredients:
            if isinstance(ing, str) and ing.strip():
                names.append(ing.strip())
            elif isinstance(ing, dict):
                name = str(ing.get("name") or ing.get("title") or "").strip()
                if name:
                    names.append(name)
    return stable_recipe_fingerprint(title=title, ingredients=names)


def _is_placeholder_image_url(url: str | None) -> bool:
    value = str(url or "").strip().lower()
    if not value:
        return True
    return (
        "placeholder" in value
        or "/uploads/placeholders/" in value
        or "photo-1504674900247-0877df9cc836" in value
    )


def _is_durable_recipe_image_url(url: str | None) -> bool:
    value = str(url or "").strip()
    if not value or _is_placeholder_image_url(value):
        return False
    path = urlsplit(value).path if value.startswith(("http://", "https://")) else value
    return isinstance(path, str) and path.startswith("/uploads/recipe-images/")


def _persist_history_recipes(db: Session, history: RecipeHistory, recipes: list[dict]) -> None:
    history.recipes = [dict(item) if isinstance(item, dict) else item for item in recipes]
    db.add(history)
    db.commit()


def _recipe_text(recipe: Recipe) -> str:
    parts: list[str] = []
    for value in (getattr(recipe, "name", None), getattr(recipe, "description", None)):
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
    ingredients = getattr(recipe, "ingredients", None)
    if isinstance(ingredients, list):
        for ing in ingredients[:40]:
            if isinstance(ing, str) and ing.strip():
                parts.append(ing.strip())
            elif isinstance(ing, dict):
                name = str(ing.get("name") or ing.get("title") or "").strip()
                if name:
                    parts.append(name)
    return " ".join(parts).lower()


def _recipe_tags(recipe: Recipe, field: str) -> set[str]:
    raw = getattr(recipe, field, None)
    if not isinstance(raw, list):
        return set()
    return {str(item).strip().lower() for item in raw if isinstance(item, str) and str(item).strip()}


def _recipe_metadata_payload(recipe: Recipe) -> dict:
    return {
        "cuisine_tags": list(_recipe_tags(recipe, "cuisine_tags")),
        "dietary_tags": list(_recipe_tags(recipe, "dietary_tags")),
        "allergen_tags": list(_recipe_tags(recipe, "allergen_tags")),
        "food_exclusion_tags": list(_recipe_tags(recipe, "food_exclusion_tags")),
        "goal_tags": list(_recipe_tags(recipe, "goal_tags")),
        "equipment_tags": list(_recipe_tags(recipe, "equipment_tags")),
        "diabetes_type_tags": list(_recipe_tags(recipe, "diabetes_type_tags")),
        "cook_time_tag": getattr(recipe, "cook_time_tag", None),
    }


def _time_minutes(recipe: Recipe) -> int | None:
    def _num(value) -> float | None:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(str(value))
        except Exception:
            return None

    prep = _num(getattr(recipe, "prep_time_minutes", None))
    cook = _num(getattr(recipe, "cook_time_minutes", None))
    if prep is None and cook is None:
        return None
    total = (prep or 0.0) + (cook or 0.0)
    if total < 0:
        return None
    return int(round(total))


def _get_nutrition_value(recipe: Recipe, keys: list[str]) -> float | None:
    nutrition = getattr(recipe, "nutrition", None)
    if not isinstance(nutrition, dict):
        return None
    for key in keys:
        if key not in nutrition:
            continue
        value = nutrition.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            m = re.search(r"(\d+(?:\.\d+)?)", value)
            if m:
                try:
                    return float(m.group(1))
                except Exception:
                    continue
    return None


def _profile_hard_allows(recipe: Recipe, *, profile: dict) -> bool:
    text = _recipe_text(recipe)
    dietary_tags = _recipe_tags(recipe, "dietary_tags")
    allergen_tags = _recipe_tags(recipe, "allergen_tags")
    exclusion_tags = _recipe_tags(recipe, "food_exclusion_tags")

    dietary = str(profile.get("dietary_pattern") or "").strip().lower()
    allergens = set(str(x).strip().lower() for x in (profile.get("allergens") or []) if isinstance(x, str) and x.strip())
    exclusions = set(
        str(x).strip().lower() for x in (profile.get("food_exclusions") or []) if isinstance(x, str) and x.strip()
    )

    if allergens and allergen_tags and allergens.intersection(allergen_tags):
        return False
    if exclusions and exclusion_tags and exclusions.intersection(exclusion_tags):
        return False
    if dietary and dietary != "none" and dietary_tags and dietary not in dietary_tags:
        return False

    allergen_keywords: dict[str, list[str]] = {
        "dairy": ["milk", "cheese", "yogurt", "butter", "cream", "whey", "casein", "kefir"],
        "eggs": ["egg"],
        "fish": ["fish", "salmon", "tuna", "sardine", "mackerel"],
        "shellfish": ["shrimp", "prawn", "crab", "lobster", "shellfish"],
        "peanuts": ["peanut"],
        "tree_nuts": ["almond", "walnut", "cashew", "pistachio", "pecan", "hazelnut", "macadamia", "nut "],
        "soy": ["soy", "tofu", "edamame", "tempeh"],
        "wheat_gluten": ["wheat", "gluten", "bread", "pasta", "flour", "couscous", "bulgur", "seitan"],
        "sesame": ["sesame", "tahini"],
    }
    for allergen, kws in allergen_keywords.items():
        if allergen in allergens and any(kw in text for kw in kws):
            return False

    exclusion_keywords: dict[str, list[str]] = {
        "pork": ["pork", "bacon", "ham", "pepperoni"],
        "beef": ["beef", "steak"],
        "chicken": ["chicken"],
        "seafood": ["seafood", "fish", "salmon", "tuna", "shrimp", "prawn", "crab", "lobster", "shellfish"],
        "onion_garlic": ["onion", "garlic"],
        "spicy_food": ["spicy", "chili", "chilli", "pepper"],
        "mushrooms": ["mushroom"],
        "alcohol": ["alcohol", "beer", "wine", "vodka", "rum", "whiskey", "cocktail"],
        "caffeine": ["caffeine", "coffee", "espresso", "energy drink"],
    }
    for avoid, kws in exclusion_keywords.items():
        if avoid in exclusions and any(kw in text for kw in kws):
            return False

    if dietary == "vegan":
        if re.search(r"\b(egg|eggs|milk|cheese|yogurt|butter|cream|chicken|beef|pork|fish|shrimp|tuna|salmon|honey)\b", text):
            return False
    elif dietary == "vegetarian":
        if re.search(r"\b(chicken|beef|pork|fish|shrimp|tuna|salmon|bacon|ham)\b", text):
            return False
    elif dietary == "pescatarian":
        if re.search(r"\b(chicken|beef|pork|bacon|ham)\b", text):
            return False
    elif dietary == "halal":
        if re.search(r"\b(pork|bacon|ham)\b", text) or "alcohol" in text:
            return False
    elif dietary == "kosher":
        if re.search(r"\b(pork|bacon|ham|shellfish|shrimp|prawn|crab|lobster)\b", text):
            return False

    return True


def _profile_score(recipe: Recipe, *, profile: dict) -> int:
    score = 0
    recipe_cuisines = _recipe_tags(recipe, "cuisine_tags")
    recipe_goals = _recipe_tags(recipe, "goal_tags")
    recipe_equipment = _recipe_tags(recipe, "equipment_tags")
    recipe_diabetes_types = _recipe_tags(recipe, "diabetes_type_tags")
    goals = set(
        str(x).strip().lower() for x in (profile.get("meal_goals") or []) if isinstance(x, str) and x.strip()
    )
    cuisines = set(
        str(x).strip().lower()
        for x in (profile.get("preferred_cuisines") or [])
        if isinstance(x, str) and x.strip()
    )
    cook_pref = str(profile.get("cook_time_preference") or "").strip().lower()
    blood_sugar_profile = str(profile.get("blood_sugar_profile") or "").strip().lower()
    equipment = set(
        str(x).strip().lower()
        for x in (profile.get("available_equipment") or [])
        if isinstance(x, str) and x.strip()
    )

    if cook_pref and cook_pref == str(getattr(recipe, "cook_time_tag", "") or "").strip().lower():
        score += 4

    total_time = _time_minutes(recipe)
    if cook_pref == "under_15" and total_time is not None and total_time <= 15:
        score += 3
    elif cook_pref == "15_30" and total_time is not None and total_time <= 30:
        score += 2
    elif cook_pref == "30_45" and total_time is not None and total_time <= 45:
        score += 1

    if "quick_meals" in goals and total_time is not None and total_time <= 20:
        score += 3

    matching_goals = goals.intersection(recipe_goals)
    score += len(matching_goals) * 3
    if cuisines and recipe_cuisines:
        score += len(cuisines.intersection(recipe_cuisines)) * 3
    if equipment and recipe_equipment:
        score += len(equipment.intersection(recipe_equipment)) * 1
    if blood_sugar_profile and recipe_diabetes_types and blood_sugar_profile in recipe_diabetes_types:
        score += 2

    carbs = _get_nutrition_value(recipe, ["carbs", "carbohydrates", "total_carbs", "net_carbs"])
    protein = _get_nutrition_value(recipe, ["protein"])
    if "lower_carb" in goals and carbs is not None and carbs <= 30:
        score += 3
    if "high_protein" in goals and protein is not None and protein >= 20:
        score += 3

    # Simple ingredients: fewer ingredients.
    ingredients = getattr(recipe, "ingredients", None)
    if "simple_ingredients" in goals and isinstance(ingredients, list):
        if len(ingredients) <= 8:
            score += 2
        elif len(ingredients) <= 12:
            score += 1

    # Lightweight cuisine keyword boost (optional, best-effort).
    cuisine_keywords: dict[str, list[str]] = {
        "west_african": ["jollof", "suya", "egusi", "okra", "ogbono", "moi moi", "pepper soup", "plantain", "yam"],
        "british_irish": ["porridge", "stew", "roast", "shepherd", "cottage pie", "beans on toast"],
        "caribbean": ["jerk", "plantain", "callaloo"],
        "mediterranean": ["olive", "greek", "tzatziki", "hummus", "tabbouleh"],
        "south_asian": ["curry", "dal", "dhal", "tikka", "masala"],
        "east_asian": ["stir fry", "teriyaki", "miso", "kimchi"],
        "latin_american": ["taco", "salsa", "burrito", "fajita"],
        "mena": ["shawarma", "tahini", "falafel", "sumac"],
    }
    text = _recipe_text(recipe)
    for c in cuisines:
        kws = cuisine_keywords.get(c)
        if kws and any(kw in text for kw in kws):
            score += 2

    return score


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
    query = db.query(Recipe).filter(Recipe.status == "published")
    if meal_type:
        query = query.filter(Recipe.meal_type == meal_type.lower())
    items = query.all()
    if not items:
        return {"items": []}
    limit = max(1, min(limit, 6))

    profile = extract_food_profile(current_user)
    has_hard_constraints = bool(profile.get("dietary_pattern")) and str(profile.get("dietary_pattern")).lower() not in {"", "none"}
    has_hard_constraints = has_hard_constraints or bool(profile.get("allergens")) or bool(profile.get("food_exclusions"))

    # Hard filter (if the user has preferences). Never violate allergies/dietary patterns just to fill 3 cards.
    filtered = items
    if profile and has_hard_constraints:
        filtered = [r for r in items if _profile_hard_allows(r, profile=profile)]

    # Score (soft ranking) then sample from the top pool for variety.
    scored = [(int(_profile_score(r, profile=profile)), r) for r in filtered]
    random.shuffle(scored)
    scored.sort(key=lambda x: x[0], reverse=True)
    pool_size = min(len(scored), max(30, limit * 10))
    top_pool = [r for _, r in scored[:pool_size]] if scored else []

    if not top_pool:
        # No matches under strict constraints; return fewer rather than showing unsafe suggestions.
        selection = []
    else:
        selection = random.sample(top_pool, k=min(limit, len(top_pool)))
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
                **_recipe_metadata_payload(r),
            }
            for r in selection
        ]
    }


@router.get("/recent")
def recent_recipes(
    request: Request,
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
    recipes = [dict(item) if isinstance(item, dict) else item for item in (latest.recipes or [])]

    # Overlay generated images (if any) using our cache mapping from image generation.
    # This makes the client "Recent recipes" reflect images even if the stored JSON still contains placeholders.
    if isinstance(recipes, list):
        for recipe in recipes:
            if not isinstance(recipe, dict):
                continue
            fingerprint = _ai_recipe_fingerprint(recipe)
            cache_key = f"recipeimg:{fingerprint}:url"
            url = cache.get(cache_key)
            if url and isinstance(url, str):
                if _is_durable_recipe_image_url(url):
                    recipe["image_url"] = url
                    recipe["image_source"] = "ai"
                else:
                    cache.delete(cache_key)

        needs_repair = False
        for recipe in recipes:
            if not isinstance(recipe, dict):
                continue
            url = recipe.get("image_url") or recipe.get("image")
            source = str(recipe.get("image_source") or recipe.get("imageSource") or "").strip().lower()
            if source == "placeholder" or not _is_durable_recipe_image_url(str(url or "")):
                recipe.pop("image", None)
                recipe["image_url"] = ""
                recipe["image_source"] = "none"
                needs_repair = True

        if needs_repair:
            try:
                attach_recipe_images(
                    db,
                    user=current_user,
                    recipes=recipes,
                    ingredients=[],
                    base_url=str(request.base_url).rstrip("/"),
                    max_generate=3,
                )
                _persist_history_recipes(db, latest, recipes)
            except Exception:
                db.rollback()
    return {"items": recipes[:3]}


@router.get("/history")
def recipe_history(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(RecipeHistory)
        .filter(RecipeHistory.user_id == current_user.id)
        .order_by(RecipeHistory.created_at.desc(), RecipeHistory.id.desc())
        .all()
    )

    all_items: list[dict] = []
    for row in rows:
        recipes = row.recipes if isinstance(row.recipes, list) else []
        for index, recipe in enumerate(recipes):
            if not isinstance(recipe, dict):
                continue
            item = dict(recipe)
            fingerprint = _ai_recipe_fingerprint(item)
            cache_key = f"recipeimg:{fingerprint}:url"
            url = cache.get(cache_key)
            if url and isinstance(url, str):
                if _is_durable_recipe_image_url(url):
                    item["image_url"] = url
                    item["image_source"] = "ai"
                else:
                    cache.delete(cache_key)
            item["history_key"] = f"history-{row.id}-{index}"
            item.setdefault("id", item["history_key"])
            item["history_id"] = row.id
            item["history_source"] = row.source
            item["history_created_at"] = row.created_at.isoformat() if row.created_at else None
            all_items.append(item)

    total = len(all_items)
    page = all_items[offset : offset + limit]
    next_offset = offset + len(page)
    return {
        "items": page,
        "total": total,
        "limit": limit,
        "offset": offset,
        "next_offset": next_offset if next_offset < total else None,
        "has_more": next_offset < total,
    }


@router.get("/{recipe_id}")
def get_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id, Recipe.status == "published").first()
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
    }
