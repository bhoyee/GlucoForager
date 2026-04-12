import hashlib
import json
from datetime import datetime, timezone
import uuid
import logging
from urllib.parse import urlsplit

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
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
from ...core.config import settings as core_settings
from ...services.recipe_image_attach_service import attach_recipe_images
from ...services.rate_limit_service import check_ai_rate_limit
from ...services.recipe_fingerprint import recipe_fingerprint as stable_recipe_fingerprint
from ...services.settings_service import get_recipe_image_settings
from ...services.subscription_service import get_effective_subscription_tier
from ...models.recipe_history import RecipeHistory
from ...services.redis_ai_queue import RedisAIQueue

router = APIRouter(prefix="/ai/recipes", tags=["ai"])
pipeline = AIPipeline()
cache = CacheService()
image_helper = AIRecipeGenerator()
VISION_CACHE_TTL_SECONDS = 21600
logger = logging.getLogger(__name__)


class VisionRecipeRequest(BaseModel):
    image_base64: str
    filters: list[str] | None = None
    include_recipes: bool = True


class VisionBatchRecipeRequest(BaseModel):
    images_base64: list[str]
    filters: list[str] | None = None
    include_recipes: bool = True


class RecipeImageRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    ingredients: list[str] | None = None


def _vision_cache_key(user_id: int, tier: str, payload: str, filters: list[str] | None, include_recipes: bool) -> str:
    filter_items = sorted({item.strip().lower() for item in (filters or []) if item})
    raw = f"{user_id}|{tier}|{payload}|{','.join(filter_items)}|include_recipes={bool(include_recipes)}"
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
        if job.status not in {"pending", "queued"}:
            return
        job.status = "running"
        db.commit()

        payload = job.payload or {}
        images_base64 = payload.get("images_base64") or []
        filters = payload.get("filters") or []
        include_recipes = bool(payload.get("include_recipes", True))
        device_id = payload.get("device_id")
        mode = payload.get("mode") or "single"
        base_url = payload.get("base_url")

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
                    include_recipes=include_recipes,
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
                    include_recipes=include_recipes,
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

        try:
            attach_recipe_images(
                db,
                user=user,
                recipes=result.get("recipes", []) or [],
                ingredients=result.get("detected", []) or [],
                base_url=base_url,
                # Generate up to 3 thumbnails so the results screen looks premium.
                # Daily limits and per-recipe caps still apply via App Settings.
                max_generate=3,
            )
        except Exception:
            pass

        job.result = {
            "results": result.get("recipes", []),
            "detected": result.get("detected", []),
            "detected_all": result.get("detected_all", []),
            "flagged_out": result.get("flagged_out", []),
            "flagged_optional": result.get("flagged_optional", []),
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
            job.error = _safe_job_error(str(exc))
            job.result = {
                "error": {
                    "type": "operational",
                    "code": "exception",
                    "message": _safe_job_error(str(exc)),
                }
            }
            db.commit()
    finally:
        db.close()


def _safe_job_error(message: str) -> str:
    raw = (message or "").strip()
    if not raw:
        return "Unable to generate recipes right now. Please try again."
    lowered = raw.lower()
    # Never leak internal fallback configuration details to end users.
    if (
        "ai_disable_emergency_fallback" in lowered
        or "emergency fallback" in lowered
        or ("fallback" in lowered and "disabled" in lowered)
        or ("emergency" in lowered and "disabled" in lowered)
    ):
        return "Unable to generate recipes right now. Please try again in a moment."
    if "all ai models failed" in lowered or "invalid output" in lowered:
        return "Unable to generate recipes right now. Please try again in a moment."
    return raw[:240]


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
        current_user.id,
        tier,
        _image_fingerprint(payload.image_base64),
        payload.filters or [],
        payload.include_recipes,
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
            if payload.include_recipes:
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
                "detected_all": cached_result.get("detected_all", []),
                "flagged_out": cached_result.get("flagged_out", []),
                "flagged_optional": cached_result.get("flagged_optional", []),
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
            include_recipes=payload.include_recipes,
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
        "detected_all": result.get("detected_all", []),
        "flagged_out": result.get("flagged_out", []),
        "flagged_optional": result.get("flagged_optional", []),
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
        current_user.id,
        tier,
        _batch_fingerprint(payload.images_base64),
        payload.filters or [],
        payload.include_recipes,
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
            if payload.include_recipes:
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
                "detected_all": cached_result.get("detected_all", []),
                "flagged_out": cached_result.get("flagged_out", []),
                "flagged_optional": cached_result.get("flagged_optional", []),
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
            include_recipes=payload.include_recipes,
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
        "detected_all": result.get("detected_all", []),
        "flagged_out": result.get("flagged_out", []),
        "flagged_optional": result.get("flagged_optional", []),
        "non_food": result.get("non_food", []),
        "filters": result.get("filters", []),
        "warning": result.get("warning"),
        "access": access,
    }


@router.post("/vision/async")
def generate_from_vision_async(
    request: Request,
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

    tier = get_effective_subscription_tier(db, current_user) or "free"
    rl = check_ai_rate_limit(user_id=current_user.id, tier=tier, kind="vision")
    if not rl.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limited",
                "message": "Too many requests. Please wait a moment and try again.",
                "retry_after_seconds": rl.retry_after_seconds,
                "limit_per_minute": rl.limit_per_minute,
            },
            headers={"Retry-After": str(rl.retry_after_seconds)},
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
            "include_recipes": bool(payload.include_recipes),
            "device_id": device_id,
            "mode": "single",
            "base_url": str(request.base_url).rstrip("/"),
        },
    )
    db.add(job)
    db.commit()
    backend = (core_settings.ai_queue_backend or "db").strip().lower()
    if backend == "redis":
        queued = False
        try:
            q = RedisAIQueue.from_settings()
            if q:
                q.enqueue_vision(job_id)
                queued = True
        except Exception:
            queued = False
        if not queued:
            background_tasks.add_task(_run_vision_job, job_id)
    else:
        if not core_settings.ai_job_runner_enabled:
            background_tasks.add_task(_run_vision_job, job_id)
    return {"job_id": job_id, "status": job.status, "access": access}


@router.post("/vision-batch/async")
def generate_from_vision_batch_async(
    request: Request,
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

    tier = get_effective_subscription_tier(db, current_user) or "free"
    rl = check_ai_rate_limit(user_id=current_user.id, tier=tier, kind="vision_batch")
    if not rl.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limited",
                "message": "Too many requests. Please wait a moment and try again.",
                "retry_after_seconds": rl.retry_after_seconds,
                "limit_per_minute": rl.limit_per_minute,
            },
            headers={"Retry-After": str(rl.retry_after_seconds)},
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
            "include_recipes": bool(payload.include_recipes),
            "device_id": device_id,
            "mode": "batch",
            "base_url": str(request.base_url).rstrip("/"),
        },
    )
    db.add(job)
    db.commit()
    backend = (core_settings.ai_queue_backend or "db").strip().lower()
    if backend == "redis":
        queued = False
        try:
            q = RedisAIQueue.from_settings()
            if q:
                q.enqueue_vision(job_id)
                queued = True
        except Exception:
            queued = False
        if not queued:
            background_tasks.add_task(_run_vision_job, job_id)
    else:
        if not core_settings.ai_job_runner_enabled:
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
    request: Request,
    payload: RecipeImageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tier = get_effective_subscription_tier(db, current_user) or "free"
    settings = get_recipe_image_settings(db)
    if not settings.enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Recipe images are disabled.")

    provider = (core_settings.recipe_image_provider or "").strip().lower() or "gemini"
    provider_ready = False
    if provider == "runware":
        provider_ready = bool(core_settings.runware_api_key)
    elif provider == "gemini":
        provider_ready = bool(core_settings.gemini_api_key)
    else:
        # Backward/robust behavior: accept any configured provider, even if env is mis-set.
        provider_ready = bool(core_settings.runware_api_key or core_settings.gemini_api_key)

    if not provider_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Recipe image provider is not configured.",
        )

    effective_tier = "premium" if tier == "premium" else "free"
    daily_limit = settings.premium_daily_limit if effective_tier == "premium" else settings.free_daily_limit
    if daily_limit == 0:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Image generation is not available.")

    recipe_payload = {
        "title": payload.title or "Diabetes-friendly meal",
        "description": payload.description or "",
        "ingredients": [{"name": name} for name in (payload.ingredients or []) if name],
    }
    title_norm = str(recipe_payload.get("title") or "").strip().lower()

    today = datetime.now(timezone.utc).date().isoformat()
    fingerprint = stable_recipe_fingerprint(
        title=str(recipe_payload["title"] or ""),
        ingredients=[str(item).strip() for item in (payload.ingredients or []) if item and str(item).strip()],
    )

    per_recipe_key = f"imggen:{current_user.id}:{today}:{fingerprint}"
    per_recipe_count_raw = cache.get(per_recipe_key)
    per_recipe_count = 0
    try:
        per_recipe_count = int(per_recipe_count_raw) if per_recipe_count_raw is not None else 0
    except Exception:  # noqa: BLE001
        per_recipe_count = 0

    if per_recipe_count >= settings.max_per_recipe:
        cached_url = cache.get(f"{per_recipe_key}:url")
        if cached_url and isinstance(cached_url, str):
            base_url = str(request.base_url).rstrip("/")
            path = urlsplit(cached_url).path if cached_url.startswith("http") else cached_url
            if path.startswith("/uploads/"):
                # Best-effort: persist to recipe history so lists/details reflect the image.
                _persist_image_to_history(
                    db,
                    user_id=current_user.id,
                    fingerprint=fingerprint,
                    image_url=f"{base_url}{path}",
                    title_norm=title_norm,
                )
                return {
                    "image_url": f"{base_url}{path}",
                    "image_source": "ai",
                    "cached": True,
                    "size": settings.size,
                    "daily_limit": daily_limit,
                }
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Image already generated for this recipe.",
        )

    if daily_limit != -1:
        daily_key = f"imggen:{current_user.id}:{today}:count"
        daily_raw = cache.get(daily_key)
        daily_count = 0
        try:
            daily_count = int(daily_raw) if daily_raw is not None else 0
        except Exception:  # noqa: BLE001
            daily_count = 0
        if daily_count >= daily_limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Daily image generation limit reached.",
            )

    try:
        image_payload = image_helper.generate_image_for_recipe(
            recipe_payload,
            tier,
            payload.ingredients or [],
            size=settings.size,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Recipe image generation failed (user_id=%s model=%s size=%s): %s",
            getattr(current_user, "id", None),
            getattr(image_helper, "gemini_image_model", None),
            settings.size,
            str(exc)[:400],
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Image generation failed. Please try again.",
        ) from None

    if image_payload.get("image_source") != "ai" or not image_payload.get("image_url"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Image generation failed. Please try again.",
        )

    # Normalize the returned URL to the same base URL the mobile client is hitting (LAN, proxy, etc.)
    # This avoids misconfiguration where SITE_URL points to a different domain.
    image_url = str(image_payload.get("image_url") or "")
    base_url = str(request.base_url).rstrip("/")
    if image_url:
        path = urlsplit(image_url).path if image_url.startswith("http") else image_url
        if path.startswith("/uploads/"):
            image_payload["image_url"] = f"{base_url}{path}"
            image_url = image_payload["image_url"]

    # Only count successful generations.
    cache.set(per_recipe_key, str(per_recipe_count + 1), ttl_seconds=24 * 60 * 60)
    cache.set(f"{per_recipe_key}:url", str(image_url), ttl_seconds=24 * 60 * 60)
    # Also store a longer-lived mapping so "recent recipes" can show images without relying on
    # mutating recipe_history JSON (which can be brittle if the client-side recipe differs slightly).
    cache.set(f"recipeimg:{fingerprint}:url", str(image_url), ttl_seconds=60 * 24 * 60 * 60)
    if daily_limit != -1:
        daily_key = f"imggen:{current_user.id}:{today}:count"
        cache.incr(daily_key, ttl_seconds=24 * 60 * 60)

    # Track successful image generations for admin cost/usage reporting.
    try:
        record_ai_request(
            db,
            current_user.id,
            tier,
            "recipe_image",
            model_used=str(
                core_settings.runware_image_model
                if provider == "runware"
                else core_settings.gemini_image_model
                if provider == "gemini"
                else (core_settings.runware_image_model or core_settings.gemini_image_model or provider or "unknown")
            ),
            tokens_used=0,
            cost_estimate=float(settings.cost_usd or 0.0),
            device_id=None,
        )
    except Exception:  # noqa: BLE001
        pass

    _persist_image_to_history(
        db,
        user_id=current_user.id,
        fingerprint=fingerprint,
        image_url=str(image_url),
        title_norm=title_norm,
    )

    image_payload["size"] = settings.size
    image_payload["daily_limit"] = daily_limit
    return image_payload


def _recipe_fingerprint_from_item(item: dict) -> str:
    title = str(item.get("title") or item.get("name") or "").strip()
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
    return stable_recipe_fingerprint(title=title, ingredients=names)


def _persist_image_to_history(
    db: Session,
    *,
    user_id: int,
    fingerprint: str,
    image_url: str,
    title_norm: str,
) -> bool:
    """
    Update the most recent recipe_history entries so /api/recipes/recent returns the generated image.
    Returns True if an entry was updated.
    """
    if not fingerprint or not image_url:
        return False

    histories = (
        db.query(RecipeHistory)
        .filter(RecipeHistory.user_id == user_id)
        .order_by(RecipeHistory.created_at.desc())
        .limit(10)
        .all()
    )
    for idx, history in enumerate(histories):
        recipes = history.recipes or []
        if not isinstance(recipes, list):
            continue
        changed = False
        for recipe in recipes:
            if not isinstance(recipe, dict):
                continue
            if _recipe_fingerprint_from_item(recipe) != fingerprint:
                continue
            recipe["image_url"] = image_url
            recipe["image_source"] = "ai"
            changed = True
        if changed:
            history.recipes = recipes
            db.add(history)
            db.commit()
            logger.info(
                "Persisted generated image into recipe_history (user_id=%s history_id=%s)",
                user_id,
                getattr(history, "id", None),
            )
            return True

        # Fallback: on the most recent history only, match by title if unique.
        if idx == 0 and title_norm:
            matches = []
            for recipe in recipes:
                if not isinstance(recipe, dict):
                    continue
                recipe_title_norm = str(recipe.get("title") or recipe.get("name") or "").strip().lower()
                if recipe_title_norm == title_norm:
                    matches.append(recipe)
            if len(matches) == 1:
                matches[0]["image_url"] = image_url
                matches[0]["image_source"] = "ai"
                history.recipes = recipes
                db.add(history)
                db.commit()
                logger.info(
                    "Persisted generated image into recipe_history by title fallback (user_id=%s history_id=%s)",
                    user_id,
                    getattr(history, "id", None),
                )
                return True

    logger.warning(
        "Did not find matching recipe in recent history to persist image (user_id=%s fingerprint=%s)",
        user_id,
        fingerprint[:12],
    )
    return False
