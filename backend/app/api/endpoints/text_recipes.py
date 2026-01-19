import hashlib
import json
import re

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, conlist, constr, validator
from sqlalchemy.orm import Session

from ...api.dependencies import check_user_access, get_current_user
from ...database import get_db
from ...models.user import User
from ...services.ai_pipeline import AIPipeline
from ...services.cache_service import CacheService
from ...services.cost_tracker import record_ai_request
from ...services.ingredient_classifier import IngredientClassifier

router = APIRouter(prefix="/ai/text", tags=["ai"])
pipeline = AIPipeline()
classifier = IngredientClassifier()
cache = CacheService()
TEXT_CACHE_TTL_SECONDS = 21600


ALLOWED_INGREDIENT_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9\s\-'/%]*$"

IngredientStr = constr(
    strip_whitespace=True,
    min_length=2,
    max_length=30,
    regex=ALLOWED_INGREDIENT_PATTERN,
)


class TextRecipeRequest(BaseModel):
    ingredients: conlist(IngredientStr, min_items=1, max_items=20)
    filters: list[str] | None = None

    @validator("ingredients", pre=True)
    def normalize_ingredients(cls, value):  # noqa: N805
        if not isinstance(value, list):
            return value
        cleaned = []
        for item in value:
            if not isinstance(item, str):
                continue
            normalized = " ".join(item.split())
            if normalized:
                cleaned.append(normalized)
        return cleaned

    @validator("ingredients")
    def reject_invalid_ingredients(cls, value):  # noqa: N805
        invalid = [item for item in value if not re.match(ALLOWED_INGREDIENT_PATTERN, item)]
        if invalid:
            raise ValueError(
                "Ingredients can only include letters, numbers, spaces, hyphens, apostrophes, slashes, or %."
            )
        return value


def _cache_key(user_id: int, tier: str, ingredients: list[str], filters: list[str] | None) -> str:
    normalized = sorted({item.strip().lower() for item in ingredients if item})
    filter_items = sorted({item.strip().lower() for item in (filters or []) if item})
    raw = f"{user_id}|{tier}|{','.join(normalized)}|{','.join(filter_items)}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"text_recipes:{digest}"


@router.post("/recipes")
def generate_from_text(
    payload: TextRecipeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    device_id: str = Header(..., alias="X-Device-Id"),
):
    access = check_user_access(current_user, db, device_id)
    if not access["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily limit reached. Scans left: {access['searches_left']}",
        )
    tier = current_user.subscription_tier or "free"
    classified = classifier.classify(payload.ingredients)
    if not classified["food"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Content not related to food. Please enter real ingredients.",
        )
    ingredients = classified["food"]
    cache_key = _cache_key(current_user.id, tier, ingredients, payload.filters or [])
    cached = cache.get(cache_key)
    if cached:
        try:
            cached_recipes = json.loads(cached) if isinstance(cached, str) else cached
        except json.JSONDecodeError:
            cached_recipes = None
        if cached_recipes:
            record_ai_request(
                db,
                current_user.id,
                tier,
                "text",
                model_used="cache",
                tokens_used=0,
                cost_estimate=0,
                device_id=device_id,
            )
            return {
                "results": cached_recipes,
                "access": access,
                "filtered_out": classified["non_food"],
                "classification_source": classified["source"],
            }
    try:
        recipes = pipeline.text_to_recipes(
            db,
            current_user.id,
            tier,
            ingredients,
            filters=payload.filters or [],
            device_id=device_id,
        )
    except RuntimeError as exc:
        # AI not configured (missing keys) or other pipeline errors
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    cache.set(cache_key, json.dumps(recipes), ttl_seconds=TEXT_CACHE_TTL_SECONDS)
    return {
        "results": recipes,
        "access": access,
        "filtered_out": classified["non_food"],
        "classification_source": classified["source"],
    }
