import hashlib
import json

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...api.dependencies import check_user_access, get_current_user
from ...database import get_db
from ...models.user import User
from ...services.ai_pipeline import AIPipeline, IngredientValidationError
from ...services.cache_service import CacheService
from ...services.cost_tracker import record_ai_request

router = APIRouter(prefix="/ai/recipes", tags=["ai"])
pipeline = AIPipeline()
cache = CacheService()
VISION_CACHE_TTL_SECONDS = 21600


class VisionRecipeRequest(BaseModel):
    image_base64: str
    filters: list[str] | None = None


class VisionBatchRecipeRequest(BaseModel):
    images_base64: list[str]
    filters: list[str] | None = None


def _vision_cache_key(user_id: int, tier: str, payload: str, filters: list[str] | None) -> str:
    filter_items = sorted({item.strip().lower() for item in (filters or []) if item})
    raw = f"{user_id}|{tier}|{payload}|{','.join(filter_items)}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"vision_recipes:{digest}"


def _image_fingerprint(image_base64: str) -> str:
    return hashlib.sha256(image_base64.encode("utf-8")).hexdigest()


def _batch_fingerprint(images_base64: list[str]) -> str:
    joined = "|".join(_image_fingerprint(item) for item in images_base64)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


@router.post("/vision")
def generate_from_vision(
    payload: VisionRecipeRequest,
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
    cache_key = _vision_cache_key(
        current_user.id, tier, _image_fingerprint(payload.image_base64), payload.filters or []
    )
    cached = cache.get(cache_key)
    if cached:
        try:
            cached_result = json.loads(cached) if isinstance(cached, str) else cached
        except json.JSONDecodeError:
            cached_result = None
        if cached_result:
            record_ai_request(
                db,
                current_user.id,
                tier,
                "vision",
                model_used="cache",
                tokens_used=0,
                cost_estimate=0,
                device_id=device_id,
            )
            record_ai_request(
                db,
                current_user.id,
                tier,
                "recipes",
                model_used="cache",
                tokens_used=0,
                cost_estimate=0,
                device_id=device_id,
            )
            return {
                "results": cached_result.get("recipes", []),
                "detected": cached_result.get("detected", []),
                "non_food": cached_result.get("non_food", []),
                "filters": cached_result.get("filters", []),
                "warning": cached_result.get("warning"),
                "access": access,
            }
    try:
        result = pipeline.fridge_to_recipes(
            db,
            current_user.id,
            tier,
            payload.image_base64,
            filters=payload.filters or [],
            device_id=device_id,
        )
    except IngredientValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    cache.set(cache_key, json.dumps(result), ttl_seconds=VISION_CACHE_TTL_SECONDS)
    return {
        "results": result.get("recipes", []),
        "detected": result.get("detected", []),
        "non_food": result.get("non_food", []),
        "filters": result.get("filters", []),
        "warning": result.get("warning"),
        "access": access,
    }


@router.post("/vision-batch")
def generate_from_vision_batch(
    payload: VisionBatchRecipeRequest,
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
    cache_key = _vision_cache_key(
        current_user.id, tier, _batch_fingerprint(payload.images_base64), payload.filters or []
    )
    cached = cache.get(cache_key)
    if cached:
        try:
            cached_result = json.loads(cached) if isinstance(cached, str) else cached
        except json.JSONDecodeError:
            cached_result = None
        if cached_result:
            record_ai_request(
                db,
                current_user.id,
                tier,
                "vision_batch",
                model_used="cache",
                tokens_used=0,
                cost_estimate=0,
                device_id=device_id,
            )
            record_ai_request(
                db,
                current_user.id,
                tier,
                "recipes",
                model_used="cache",
                tokens_used=0,
                cost_estimate=0,
                device_id=device_id,
            )
            return {
                "results": cached_result.get("recipes", []),
                "detected": cached_result.get("detected", []),
                "non_food": cached_result.get("non_food", []),
                "filters": cached_result.get("filters", []),
                "warning": cached_result.get("warning"),
                "access": access,
            }
    try:
        result = pipeline.fridge_to_recipes_batch(
            db,
            current_user.id,
            tier,
            payload.images_base64,
            filters=payload.filters or [],
            device_id=device_id,
        )
    except IngredientValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    cache.set(cache_key, json.dumps(result), ttl_seconds=VISION_CACHE_TTL_SECONDS)
    return {
        "results": result.get("recipes", []),
        "detected": result.get("detected", []),
        "non_food": result.get("non_food", []),
        "filters": result.get("filters", []),
        "warning": result.get("warning"),
        "access": access,
    }


@router.post("/fridge-to-recipes")
def fridge_to_recipes_alias(
    payload: VisionRecipeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return generate_from_vision(payload, db, current_user)
