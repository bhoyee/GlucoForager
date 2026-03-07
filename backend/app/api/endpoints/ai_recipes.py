import hashlib
import json
from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...api.dependencies import check_user_access, get_current_user
from ...database import get_db, SessionLocal
from ...models.ai_job import AIJob
from ...models.user import User
from ...services.ai_pipeline import AIPipeline, IngredientValidationError
from ...services.ai_recipe_generator import AIRecipeGenerator
from ...services.cache_service import CacheService
from ...services.cost_tracker import record_ai_request
from ...services.settings_service import get_recipe_image_settings
from ...services.subscription_service import get_effective_subscription_tier

router = APIRouter(prefix="/ai/recipes", tags=["ai"])
pipeline = AIPipeline()
cache = CacheService()
image_helper = AIRecipeGenerator()
VISION_CACHE_TTL_SECONDS = 21600


class VisionRecipeRequest(BaseModel):
    image_base64: str
    filters: list[str] | None = None


class VisionBatchRecipeRequest(BaseModel):
    images_base64: list[str]
    filters: list[str] | None = None


class RecipeImageRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    ingredients: list[str] | None = None


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


def _ensure_images(recipes: list[dict], tier: str, ingredients: list[str]) -> list[dict]:
    if not recipes:
        return recipes
    missing = any(not recipe.get("image_url") for recipe in recipes)
    if missing:
        image_helper._attach_placeholders(recipes)
    return recipes


def _run_vision_job(job_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.query(AIJob).filter(AIJob.id == job_id).first()
        if not job:
            return
        job.status = "running"
        db.commit()

        payload = job.payload or {}
        images_base64 = payload.get("images_base64") or []
        filters = payload.get("filters") or []
        device_id = payload.get("device_id")
        mode = payload.get("mode") or "single"

        user = db.query(User).filter(User.id == job.user_id).first()
        if not user:
            job.status = "failed"
            job.error = "User not found."
            db.commit()
            return

        tier = get_effective_subscription_tier(db, user) or "free"
        try:
            if mode == "batch":
                result = pipeline.fridge_to_recipes_batch(
                    db,
                    user.id,
                    tier,
                    images_base64,
                    filters=filters,
                    device_id=device_id,
                )
            else:
                image_b64 = images_base64[0] if images_base64 else ""
                result = pipeline.fridge_to_recipes(
                    db,
                    user.id,
                    tier,
                    image_b64,
                    filters=filters,
                    device_id=device_id,
                )
        except IngredientValidationError as exc:
            job.status = "failed"
            job.error = exc.message
            job.result = {
                "error": {
                    "type": "invalid_input",
                    "code": exc.code,
                    "message": exc.message,
                }
            }
            db.commit()
            return

        job.result = {
            "results": result.get("recipes", []),
            "detected": result.get("detected", []),
            "non_food": result.get("non_food", []),
            "filters": result.get("filters", []),
            "warning": result.get("warning"),
        }
        job.status = "completed"
        job.error = None
        db.commit()
    except Exception as exc:  # noqa: BLE001
        if "job" in locals() and job:
            job.status = "failed"
            job.error = str(exc)
            job.result = {
                "error": {
                    "type": "operational",
                    "code": "exception",
                    "message": str(exc),
                }
            }
            db.commit()
    finally:
        db.close()


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
    tier = get_effective_subscription_tier(db, current_user) or "free"
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
            cached_recipes = _ensure_images(
                cached_result.get("recipes", []),
                tier,
                cached_result.get("detected", []),
            )
            cached_result["recipes"] = cached_recipes
            cache.set(cache_key, json.dumps(cached_result), ttl_seconds=VISION_CACHE_TTL_SECONDS)
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
    tier = get_effective_subscription_tier(db, current_user) or "free"
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
            cached_recipes = _ensure_images(
                cached_result.get("recipes", []),
                tier,
                cached_result.get("detected", []),
            )
            cached_result["recipes"] = cached_recipes
            cache.set(cache_key, json.dumps(cached_result), ttl_seconds=VISION_CACHE_TTL_SECONDS)
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


@router.post("/vision/async")
def generate_from_vision_async(
    payload: VisionRecipeRequest,
    background_tasks: BackgroundTasks,
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
    job_id = str(uuid.uuid4())
    job = AIJob(
        id=job_id,
        user_id=current_user.id,
        source="vision",
        status="pending",
        payload={
            "images_base64": [payload.image_base64],
            "filters": payload.filters or [],
            "device_id": device_id,
            "mode": "single",
        },
    )
    db.add(job)
    db.commit()
    background_tasks.add_task(_run_vision_job, job_id)
    return {"job_id": job_id, "status": job.status, "access": access}


@router.post("/vision-batch/async")
def generate_from_vision_batch_async(
    payload: VisionBatchRecipeRequest,
    background_tasks: BackgroundTasks,
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
    job_id = str(uuid.uuid4())
    job = AIJob(
        id=job_id,
        user_id=current_user.id,
        source="vision_batch",
        status="pending",
        payload={
            "images_base64": payload.images_base64,
            "filters": payload.filters or [],
            "device_id": device_id,
            "mode": "batch",
        },
    )
    db.add(job)
    db.commit()
    background_tasks.add_task(_run_vision_job, job_id)
    return {"job_id": job_id, "status": job.status, "access": access}


@router.get("/vision/async/{job_id}")
def get_vision_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = (
        db.query(AIJob)
        .filter(AIJob.id == job_id, AIJob.user_id == current_user.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return {
        "job_id": job.id,
        "status": job.status,
        "error": job.error,
        "result": job.result,
    }


@router.post("/fridge-to-recipes")
def fridge_to_recipes_alias(
    payload: VisionRecipeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return generate_from_vision(payload, db, current_user)


@router.post("/image")
def generate_recipe_image(
    payload: RecipeImageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tier = get_effective_subscription_tier(db, current_user) or "free"
    settings = get_recipe_image_settings(db)
    if not settings.enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Recipe images are disabled.")

    effective_tier = "premium" if tier == "premium" else "free"
    daily_limit = settings.premium_daily_limit if effective_tier == "premium" else settings.free_daily_limit
    if daily_limit == 0:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Image generation is not available.")

    recipe_payload = {
        "title": payload.title or "Diabetes-friendly meal",
        "description": payload.description or "",
        "ingredients": [{"name": name} for name in (payload.ingredients or []) if name],
    }

    today = datetime.now(timezone.utc).date().isoformat()
    fingerprint = hashlib.sha256(
        (
            recipe_payload["title"]
            + "|"
            + recipe_payload["description"]
            + "|"
            + ",".join(payload.ingredients or [])
        ).encode("utf-8")
    ).hexdigest()

    per_recipe_key = f"imggen:{current_user.id}:{today}:{fingerprint}"
    per_recipe_count_raw = cache.get(per_recipe_key)
    per_recipe_count = 0
    try:
        per_recipe_count = int(per_recipe_count_raw) if per_recipe_count_raw is not None else 0
    except Exception:  # noqa: BLE001
        per_recipe_count = 0

    if per_recipe_count >= settings.max_per_recipe:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Image already generated for this recipe.",
        )

    if daily_limit != -1:
        daily_key = f"imggen:{current_user.id}:{today}:count"
        next_count = cache.incr(daily_key, ttl_seconds=24 * 60 * 60)
        if next_count > daily_limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Daily image generation limit reached.",
            )

    cache.set(per_recipe_key, str(per_recipe_count + 1), ttl_seconds=24 * 60 * 60)

    image_payload = image_helper.generate_image_for_recipe(
        recipe_payload,
        tier,
        payload.ingredients or [],
    )
    if image_payload.get("image_url"):
        image_payload["image_source"] = "ai"
    image_payload["size"] = settings.size
    image_payload["daily_limit"] = daily_limit
    return image_payload
