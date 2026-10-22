"""Recipe bank: every recipe users generate is kept (once) and reused.

- find_matches(): recipes already in the bank that a fridge can cook - an indexed lookup on
  ingredient_keys (GIN), then a small in-memory score. Milliseconds, with a hard time limit.
- save_generated(): stores new recipes, skipping exact and near-duplicates. A recipe is
  published straight away only if it passes the quality gate (real photo, complete, within
  diabetes nutrition targets); otherwise it waits as a draft.
- attach_image(): when a draft's photo arrives later, it gets the photo and is re-checked.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from datetime import datetime

from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models.recipe import Recipe
from ..models.recipe_history import RecipeHistory
from .cache_service import CacheService
from .recipe_keys import ingredient_keys, title_key

logger = logging.getLogger(__name__)

SOURCE = "user_generated"
MIN_COVERAGE = 0.75  # share of a bank recipe's main ingredients the fridge must have
NEAR_DUP_INGREDIENTS = 0.8
NEAR_DUP_TITLE = 0.5
SEARCH_TIMEOUT_MS = 200
CANDIDATES = 60

_MEAT = ["chicken", "beef", "turkey", "lamb", "pork", "bacon", "ham", "goat", "mince", "steak", "sausage"]
_FISH = ["fish", "salmon", "tuna", "cod", "mackerel", "sardine", "tilapia", "shrimp", "prawn", "crab", "lobster"]
_ANIMAL = ["egg", "milk", "cheese", "yogurt", "yoghurt", "butter", "cream", "honey", "kefir", "whey", "feta"]
_ALLERGENS = {
    "dairy": ["milk", "cheese", "yogurt", "yoghurt", "butter", "cream", "whey", "kefir", "feta"],
    "eggs": ["egg"],
    "fish": ["fish", "salmon", "tuna", "sardine", "mackerel", "cod", "tilapia"],
    "shellfish": ["shrimp", "prawn", "crab", "lobster", "shellfish"],
    "peanuts": ["peanut"],
    "tree_nuts": ["almond", "walnut", "cashew", "pistachio", "pecan", "hazelnut", "macadamia"],
    "soy": ["soy", "tofu", "edamame", "tempeh"],
    "wheat_gluten": ["wheat", "bread", "pasta", "flour", "couscous", "bulgur", "seitan", "barley"],
    "sesame": ["sesame", "tahini"],
}
_EXCLUSIONS = {
    "pork": ["pork", "bacon", "ham"],
    "beef": ["beef", "steak"],
    "chicken": ["chicken"],
    "seafood": _FISH,
    "onion_garlic": ["onion", "garlic"],
    "mushrooms": ["mushroom"],
    "alcohol": ["wine", "beer", "rum", "brandy"],
}
_ALLOWED_ALLERGENS = set(_ALLERGENS)



def _words(value: str) -> set[str]:
    return set(title_key(value).split())


def _jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def _recipe_text(recipe: dict) -> str:
    names = " ".join(
        str(i.get("name") if isinstance(i, dict) else i or "") for i in (recipe.get("ingredients") or [])
    )
    return f" {str(recipe.get('title') or recipe.get('name') or '').lower()} {names.lower()} "


def _has_any(text_: str, words: list[str]) -> bool:
    return any(re.search(rf"\b{re.escape(w)}", text_) for w in words)


def derive_tags(recipe: dict) -> dict:
    """Allergen/diet tags from the ingredients (rules), merged with any the AI supplied."""
    t = _recipe_text(recipe)
    allergens = {a for a, kws in _ALLERGENS.items() if _has_any(t, kws)}
    allergens |= {str(x).lower() for x in (recipe.get("allergen_tags") or []) if str(x).lower() in _ALLOWED_ALLERGENS}
    exclusions = sorted(e for e, kws in _EXCLUSIONS.items() if _has_any(t, kws))
    has_meat, has_fish, has_animal = _has_any(t, _MEAT), _has_any(t, _FISH), _has_any(t, _ANIMAL)
    dietary = set()
    if not has_meat and not has_fish:
        dietary.add("vegetarian")
        if not has_animal:
            dietary.add("vegan")
    if not has_meat:
        dietary.add("pescatarian")
    if not _has_any(t, ["pork", "bacon", "ham", "wine", "beer", "rum"]):
        dietary.add("halal")
    # Diet tags come from the ingredients only: an AI label can't make a meat dish "vegetarian".
    return {"allergen_tags": sorted(allergens), "dietary_tags": sorted(dietary), "food_exclusion_tags": exclusions}


def _nutrition(recipe: dict) -> dict:
    src = recipe.get("nutritional_info") or recipe.get("nutrition") or {}
    out = {}
    for k in ("calories", "carbs", "protein", "fat", "fiber", "sugar"):
        try:
            out[k] = float(src.get(k) or 0)
        except Exception:  # noqa: BLE001
            out[k] = 0.0
    return out


def _meal_type(recipe: dict) -> str:
    mt = str(recipe.get("meal_type") or "").strip().lower()
    return mt if mt in {"breakfast", "lunch", "dinner", "snack"} else "dinner"


def _is_real_image(url: str | None) -> bool:
    from .recipe_image_attach_service import _is_durable_recipe_image_url

    return bool(url) and _is_durable_recipe_image_url(str(url))


def _passes_gate(row: Recipe) -> bool:
    from .recipe_generation_service import _recipe_nutrition_safety_flags

    if not _is_real_image(row.image_url):
        return False
    if len(row.ingredients or []) < 3 or len(row.instructions or []) < 3:
        return False
    flags = _recipe_nutrition_safety_flags(row.meal_type, row.nutrition)
    blocking = {"danger_high_sugar", "danger_high_carbs", "high_sugar", "high_carbs", "nutrition_missing"}
    return not any(f.get("code") in blocking for f in flags)


def _to_recipe_dict(row: Recipe) -> dict:
    n = dict(row.nutrition or {})
    n.setdefault("glycemic_index", None)
    total = (row.prep_time_minutes or 0) + (row.cook_time_minutes or 0)
    return {
        "title": row.name,
        "description": row.description or "",
        "prep_time": row.prep_time_minutes or 0,
        "cook_time": row.cook_time_minutes or 0,
        "total_time": total,
        "servings": row.servings or 2,
        "ingredients": row.ingredients or [],
        "instructions": row.instructions or [],
        "nutritional_info": n,
        "tags": ["diabetes-friendly"],
        "meal_type": row.meal_type,
        "image_url": row.image_url,
        "image_source": "ai",
        "_bank_id": row.id,
        "_source": "bank",
    }


def _recent_title_keys(db: Session, user_id: int) -> set[str]:
    rows = (
        db.query(RecipeHistory.recipes)
        .filter(RecipeHistory.user_id == user_id)
        .order_by(RecipeHistory.created_at.desc())
        .limit(10)
        .all()
    )
    out = set()
    for (recipes,) in rows:
        for r in recipes or []:
            if isinstance(r, dict):
                out.add(title_key(r.get("title") or r.get("name") or ""))
    return out


def find_matches(db: Session, user, fridge: list[str], *, limit: int = 2, exclude_titles: list[str] | None = None) -> list[dict]:
    """Bank recipes this fridge can cook, best first. Never slower than SEARCH_TIMEOUT_MS."""
    started = time.time()
    fridge_keys = set(ingredient_keys(fridge))
    if len(fridge_keys) < 2 or limit <= 0:
        return []
    try:
        cache = CacheService()
        ck = "bank:match:" + hashlib.sha1(json.dumps(sorted(fridge_keys)).encode()).hexdigest()[:20]
        cached = cache.get(ck)
        if cached:
            ids = json.loads(cached)
        else:
            # Bounded: the index finds overlapping recipes; a statement timeout guards a busy DB.
            db.execute(text(f"SET LOCAL statement_timeout = {SEARCH_TIMEOUT_MS}"))
            rows = (
                db.query(Recipe.id, Recipe.ingredient_keys)
                .filter(Recipe.status == "published", Recipe.ingredient_keys.overlap(sorted(fridge_keys)))
                .order_by(Recipe.times_served.asc(), Recipe.id.desc())
                .limit(CANDIDATES)
                .all()
            )
            scored = []
            for rid, keys in rows:
                keys = set(keys or [])
                if not keys:
                    continue
                shared = keys & fridge_keys
                coverage = len(shared) / len(keys)
                if len(shared) >= 2 and coverage >= MIN_COVERAGE:
                    scored.append((coverage * 2 + len(shared) / len(fridge_keys), rid))
            scored.sort(reverse=True)
            ids = [rid for _, rid in scored[:12]]
            cache.set(ck, json.dumps(ids), ttl_seconds=10 * 60)
        if not ids:
            return []

        from ..api.endpoints.recipes import _profile_hard_allows
        from .food_profile_service import extract_food_profile

        profile = extract_food_profile(user) or {}
        skip = {title_key(t) for t in (exclude_titles or [])} | _recent_title_keys(db, user.id)
        by_id = {r.id: r for r in db.query(Recipe).filter(Recipe.id.in_(ids), Recipe.status == "published").all()}
        picked = []
        for rid in ids:
            row = by_id.get(rid)
            if not row or (row.title_key or title_key(row.name)) in skip:
                continue
            if profile and not _profile_hard_allows(row, profile=profile):
                continue
            picked.append(row)
            if len(picked) >= limit:
                break
        for row in picked:
            row.times_served = (row.times_served or 0) + 1
        db.commit()
        logger.info("Recipe bank: %s match(es) in %.0f ms", len(picked), (time.time() - started) * 1000)
        return [_to_recipe_dict(r) for r in picked]
    except Exception as exc:  # noqa: BLE001 - the bank is a shortcut; never block generation.
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        logger.warning("Recipe bank search skipped: %s", str(exc)[:200])
        return []


def _is_near_duplicate(db: Session, tk: str, keys: list[str]) -> bool:
    if not keys:
        return False
    rows = (
        db.query(Recipe.title_key, Recipe.name, Recipe.ingredient_keys)
        .filter(Recipe.ingredient_keys.overlap(keys))
        .limit(80)
        .all()
    )
    words = set(tk.split())
    for other_tk, other_name, other_keys in rows:
        if _jaccard(set(keys), set(other_keys or [])) >= NEAR_DUP_INGREDIENTS and _jaccard(
            words, set((other_tk or title_key(other_name)).split())
        ) >= NEAR_DUP_TITLE:
            return True
    return False


# Example nutrition from recipe prompts; a recipe carrying these exact numbers wasn't really estimated.
_TEMPLATE_NUTRITION = [
    (320.0, 24.0, 18.0, 12.0, 6.0, 5.0),
    (320.0, 18.0, 28.0, 12.0, 7.0, 4.0),
    (320.0, 15.0, 35.0, 12.0, 6.0, 3.0),
]


def _looks_like_template_nutrition(recipe: dict) -> bool:
    n = _nutrition(recipe)
    values = (n["calories"], n["carbs"], n["protein"], n["fat"], n["fiber"], n["sugar"])
    return values in _TEMPLATE_NUTRITION or not any(values)


def save_generated(recipes: list[dict]) -> dict:
    """Store newly generated recipes in the bank (own session; safe to run in a background thread)."""
    saved, skipped = 0, 0
    db = SessionLocal()
    try:
        for r in recipes or []:
            if not isinstance(r, dict) or r.get("_source") == "bank":
                continue
            name = str(r.get("title") or r.get("name") or "").strip()[:120]
            tk = title_key(name)
            keys = ingredient_keys(r.get("ingredients") or [])
            if not tk or len(keys) < 2:
                skipped += 1
                continue
            if db.query(Recipe.id).filter(Recipe.title_key == tk).first() or _is_near_duplicate(db, tk, keys):
                skipped += 1
                continue
            if _looks_like_template_nutrition(r):
                skipped += 1  # Copied example numbers, not a real estimate: never bank it.
                continue
            tags = derive_tags(r)
            now = datetime.utcnow()
            row = Recipe(
                name=name,
                meal_type=_meal_type(r),
                description=str(r.get("description") or "")[:500],
                prep_time_minutes=int(float(r.get("prep_time") or 0)),
                cook_time_minutes=int(float(r.get("cook_time") or 0)),
                servings=int(float(r.get("servings") or 2)),
                image_url=r.get("image_url") if _is_real_image(r.get("image_url")) else None,
                ingredients=[i if isinstance(i, dict) else {"name": str(i)} for i in (r.get("ingredients") or [])],
                instructions=[str(s) for s in (r.get("instructions") or [])],
                nutrition=_nutrition(r),
                cuisine_tags=[],
                dietary_tags=tags["dietary_tags"],
                allergen_tags=tags["allergen_tags"],
                food_exclusion_tags=tags["food_exclusion_tags"],
                goal_tags=[],
                equipment_tags=[],
                diabetes_type_tags=[],
                safety_flags=[],
                status="draft",
                source=SOURCE,
                title_key=tk,
                ingredient_keys=keys,
                created_at=now,
                updated_at=now,
            )
            from .recipe_generation_service import _recipe_nutrition_safety_flags

            row.safety_flags = _recipe_nutrition_safety_flags(row.meal_type, row.nutrition)
            row.status = "published" if _passes_gate(row) else "draft"
            try:
                db.add(row)
                db.commit()
                saved += 1
            except IntegrityError:  # Someone saved the same title a moment ago.
                db.rollback()
                skipped += 1
        return {"saved": saved, "skipped": skipped}
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.warning("Recipe bank save failed: %s", str(exc)[:200])
        return {"saved": saved, "skipped": skipped, "error": str(exc)[:200]}
    finally:
        db.close()


def attach_image(title: str, image_url: str) -> None:
    """A photo arrived for a bank draft: store it and publish if it now passes the gate."""
    if not _is_real_image(image_url):
        return
    db = SessionLocal()
    try:
        row = db.query(Recipe).filter(Recipe.title_key == title_key(title), Recipe.source == SOURCE).first()
        if not row or row.image_url:
            return
        row.image_url = image_url
        if row.status == "draft" and _passes_gate(row):
            row.status = "published"
        row.updated_at = datetime.utcnow()
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.info("Recipe bank image attach skipped: %s", str(exc)[:160])
    finally:
        db.close()


def bank_stats(db: Session) -> dict:
    rows = db.query(Recipe.source, Recipe.status, func.count()).group_by(Recipe.source, Recipe.status).all()
    return {f"{s}:{st}": n for s, st, n in rows}
