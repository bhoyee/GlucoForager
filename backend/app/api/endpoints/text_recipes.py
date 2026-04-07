import hashlib
import json
import re
import time
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from ...api.dependencies import check_user_access, get_current_user
from ...database import get_db
from ...database import SessionLocal
from ...models.ai_job import AIJob
from ...models.user import User
from ...services.ai_pipeline import AIPipeline
from ...services.ai_recipe_generator import AIRecipeGenerator
from ...services.cache_service import CacheService
from ...services.cost_tracker import record_ai_request
from ...services.ingredient_classifier import IngredientClassifier
from ...services.recipe_image_attach_service import attach_recipe_images
from ...services.rate_limit_service import check_ai_rate_limit
from ...services.subscription_service import get_effective_subscription_tier
from ...core.config import settings
from ...services.redis_ai_queue import RedisAIQueue
from .ai_recipes import _safe_job_error

router = APIRouter(prefix="/ai/text", tags=["ai"])
pipeline = AIPipeline()
classifier = IngredientClassifier()
cache = CacheService()
image_helper = AIRecipeGenerator()
TEXT_CACHE_TTL_SECONDS = 21600


ALLOWED_INGREDIENT_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9\s\-'/%]*$"

IngredientStr = Annotated[
    str,
    Field(
        min_length=2,
        max_length=30,
        pattern=ALLOWED_INGREDIENT_PATTERN,
    ),
]


class TextRecipeRequest(BaseModel):
    ingredients: list[IngredientStr] = Field(default_factory=list, max_length=20)
    filters: list[str] | None = None
    exclude_titles: list[str] | None = Field(default=None, max_length=20)
    variety_mode: bool = False
    mode: Literal["ingredients", "surprise", "quick"] = "ingredients"

    @model_validator(mode="after")
    def validate_mode(self):  # noqa: D401
        """Allow empty ingredients only for special modes."""
        if self.mode == "ingredients" and not self.ingredients:
            raise ValueError("Please enter at least one ingredient.")
        return self

    @field_validator("ingredients", mode="before")
    def normalize_ingredients(cls, value):  # noqa: N805
        if not isinstance(value, list):
            return value
        cleaned = []
        for item in value:
            if not isinstance(item, str):
                continue
            # Accept comma-separated input as a convenience (mobile users often paste lists).
            parts = [part.strip() for part in item.split(",")] if "," in item else [item.strip()]
            for part in parts:
                part = part.strip().strip(",.;")
                normalized = " ".join(part.split())
                if normalized:
                    cleaned.append(normalized)
        return cleaned

    @field_validator("ingredients")
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


def _ensure_images(recipes: list[dict], tier: str, ingredients: list[str]) -> list[dict]:
    if not recipes:
        return recipes
    missing = any(not recipe.get("image_url") for recipe in recipes)
    if missing:
        image_helper._attach_placeholders(recipes)
    return recipes


def _filters_for_mode(mode: str) -> list[str]:
    if mode == "quick":
        return ["diabetes-friendly", "low carb", "under 20 minutes", "high protein"]
    if mode == "surprise":
        return ["diabetes-friendly"]
    return []


def _run_text_job(job_id: str) -> None:
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
        ingredients = payload.get("ingredients") or []
        filters = payload.get("filters") or []
        exclude_titles = payload.get("exclude_titles") or []
        variety_mode = bool(payload.get("variety_mode") or False)
        mode = (payload.get("mode") or "ingredients").strip().lower()
        device_id = payload.get("device_id")
        base_url = payload.get("base_url")

        user = db.query(User).filter(User.id == job.user_id).first()
        if not user:
            job.status = "failed"
            job.error = "User not found."
            db.commit()
            return

        if mode not in ("surprise", "quick"):
            classified = classifier.classify(ingredients)
            if not classified["food"]:
                job.status = "failed"
                job.error = "Content not related to food. Please enter real ingredients."
                job.result = {
                    "error": {
                        "type": "invalid_input",
                        "code": "not_food",
                        "message": job.error,
                    }
                }
                db.commit()
                return
            ingredients = classified["food"]
        else:
            classified = {"food": [], "non_food": [], "source": "mode"}
            ingredients = []
            filters = [*(_filters_for_mode(mode)), *filters]
            variety_mode = True

        recipes = pipeline.text_to_recipes(
            db,
            user.id,
            get_effective_subscription_tier(db, user) or "free",
            ingredients,
            filters=filters,
            exclude_titles=exclude_titles,
            variety_mode=variety_mode,
            mode=mode,
            device_id=device_id,
        )

        try:
            attach_recipe_images(
                db,
                user=user,
                recipes=recipes or [],
                ingredients=ingredients,
                base_url=base_url,
                # Keep async jobs fast/reliable: use placeholders by default.
                # Users can still generate images explicitly via /api/ai/recipes/image if needed.
                max_generate=0,
            )
        except Exception:
            # Image generation is best-effort; never fail the recipe result.
            pass

        providers: list[str] = []
        models: list[str] = []
        try:
            for r in recipes or []:
                if not isinstance(r, dict):
                    continue
                p = (r.get("_ai_provider") or "").strip()
                m = (r.get("_ai_model") or "").strip()
                if p:
                    providers.append(p)
                if m:
                    models.append(m)
        except Exception:
            providers = []
            models = []

        warning = None
        if classified.get("non_food"):
            warning = {
                "code": "non_food_ignored",
                "message": "Some items were not food ingredients and were ignored.",
                "source": classified["source"],
            }
        job.result = {
            "results": recipes,
            "detected": classified["food"],
            "filtered_out": classified["non_food"],
            "classification_source": classified["source"],
            "warning": warning,
            "ai": {
                "providers": sorted(set(providers)),
                "models": sorted(set(models)),
            },
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
                    "message": str(exc),
                }
            }
            db.commit()
    finally:
        db.close()


def _run_text_job_delayed(job_id: str, delay_seconds: int = 12) -> None:
    """
    Safety net for Redis queue mode:
    - If the Redis enqueue succeeds but the worker is down/misconfigured, jobs can get stuck in pending/queued.
    - Run a delayed fallback in BackgroundTasks to avoid infinite pending jobs.

    The delay reduces the chance of double-processing when a healthy worker picks the job quickly.
    """

    try:
        time.sleep(max(0, int(delay_seconds)))
    except Exception:
        # If sleep fails, just continue.
        pass

    db = SessionLocal()
    try:
        job = db.query(AIJob).filter(AIJob.id == job_id).first()
        if not job:
            return
        if job.status not in {"pending", "queued"}:
            return
    finally:
        try:
            db.close()
        except Exception:
            pass

    _run_text_job(job_id)


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
    tier = get_effective_subscription_tier(db, current_user) or "free"
    mode = payload.mode
    if mode == "ingredients":
        classified = classifier.classify(payload.ingredients)
        if not classified["food"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Content not related to food. Please enter real ingredients.",
            )
        ingredients = classified["food"]
        filters = payload.filters or []
        warning = None
        if classified["non_food"]:
            warning = {
                "code": "non_food_ignored",
                "message": "Some items were not food ingredients and were ignored.",
                "source": classified["source"],
            }
    else:
        classified = {"food": [], "non_food": [], "source": "mode"}
        ingredients = []
        filters = [*(_filters_for_mode(mode)), *(payload.filters or [])]
        warning = None

    use_cache = not (mode != "ingredients" or payload.variety_mode or (payload.exclude_titles or []))
    cache_key = _cache_key(current_user.id, tier, ingredients, payload.filters or [])
    if use_cache:
        cached = cache.get(cache_key)
        if cached:
            try:
                cached_recipes = json.loads(cached) if isinstance(cached, str) else cached
            except json.JSONDecodeError:
                cached_recipes = None
            if cached_recipes:
                cached_recipes = _ensure_images(cached_recipes, tier, ingredients)
                cache.set(cache_key, json.dumps(cached_recipes), ttl_seconds=TEXT_CACHE_TTL_SECONDS)
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
                    "detected": classified.get("food") or [],
                    "filtered_out": classified.get("non_food") or [],
                    "classification_source": classified["source"],
                    "warning": warning,
                }
    try:
        recipes = pipeline.text_to_recipes(
            db,
            current_user.id,
            tier,
            ingredients,
            filters=filters,
            exclude_titles=payload.exclude_titles or [],
            variety_mode=payload.variety_mode or (mode != "ingredients"),
            mode=mode,
            device_id=device_id,
        )
    except RuntimeError as exc:
        # AI not configured (missing keys) or other pipeline errors
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if use_cache:
        cache.set(cache_key, json.dumps(recipes), ttl_seconds=TEXT_CACHE_TTL_SECONDS)
    return {
        "results": recipes,
        "access": access,
        "detected": classified.get("food") or [],
        "filtered_out": classified.get("non_food") or [],
        "classification_source": classified["source"],
        "warning": warning,
        "ai": {
            "providers": sorted({(r.get("_ai_provider") or "").strip() for r in (recipes or []) if isinstance(r, dict) and (r.get("_ai_provider") or "").strip()}),
            "models": sorted({(r.get("_ai_model") or "").strip() for r in (recipes or []) if isinstance(r, dict) and (r.get("_ai_model") or "").strip()}),
        },
    }


@router.post("/recipes/async")
def generate_from_text_async(
    request: Request,
    payload: TextRecipeRequest,
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
    rl = check_ai_rate_limit(user_id=current_user.id, tier=tier, kind="text")
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
        source="text",
        status="pending",
        payload={
            "ingredients": payload.ingredients,
            "filters": payload.filters or [],
            "exclude_titles": payload.exclude_titles or [],
            "variety_mode": payload.variety_mode,
            "mode": payload.mode,
            "device_id": device_id,
            "base_url": str(request.base_url).rstrip("/"),
        },
    )
    db.add(job)
    db.commit()

    backend = (settings.ai_queue_backend or "db").strip().lower()
    if backend == "redis":
        queued = False
        try:
            q = RedisAIQueue.from_settings()
            if q:
                q.enqueue_text(job_id)
                queued = True
        except Exception:
            queued = False

        if queued:
            try:
                # Reflect that we handed off to the queue.
                job.status = "queued"
                db.commit()
            except Exception:
                try:
                    db.rollback()
                except Exception:
                    pass

            # Safety net: if the worker never picks it up, run it here after a short delay.
            background_tasks.add_task(_run_text_job_delayed, job_id)
        if not queued:
            # Fallback: run inline via BackgroundTasks to avoid jobs getting stuck when Redis misbehaves.
            background_tasks.add_task(_run_text_job, job_id)
    else:
        # DB runner picks jobs and executes them with bounded pools.
        # If it's disabled, fall back to BackgroundTasks.
        if not settings.ai_job_runner_enabled:
            background_tasks.add_task(_run_text_job, job_id)
    return {"job_id": job_id, "status": job.status, "access": access}


@router.get("/recipes/async/{job_id}")
def get_text_job(
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
