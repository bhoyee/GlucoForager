import hashlib
import json
import re
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
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
from ...services.subscription_service import get_effective_subscription_tier

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
        job.status = "running"
        db.commit()

        payload = job.payload or {}
        ingredients = payload.get("ingredients") or []
        filters = payload.get("filters") or []
        exclude_titles = payload.get("exclude_titles") or []
        variety_mode = bool(payload.get("variety_mode") or False)
        mode = (payload.get("mode") or "ingredients").strip().lower()
        device_id = payload.get("device_id")

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
    }


@router.post("/recipes/async")
def generate_from_text_async(
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
        },
    )
    db.add(job)
    db.commit()

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
