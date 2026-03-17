from __future__ import annotations

import logging
from datetime import datetime, timezone
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from ..models.user import User
from ..services.ai_recipe_generator import AIRecipeGenerator
from ..services.cache_service import CacheService
from ..services.cost_tracker import record_ai_request
from ..services.settings_service import get_recipe_image_settings
from ..services.subscription_service import get_effective_subscription_tier
from ..core.config import settings as core_settings
from ..services.recipe_fingerprint import recipe_fingerprint as stable_recipe_fingerprint

logger = logging.getLogger(__name__)


def _normalize_base_url(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    return raw.rstrip("/")


def _normalize_image_url(image_url: str, *, base_url: str | None) -> str:
    if not image_url:
        return image_url
    if not base_url:
        return image_url
    base = _normalize_base_url(base_url)
    if not base:
        return image_url
    path = urlsplit(image_url).path if image_url.startswith("http") else image_url
    if isinstance(path, str) and path.startswith("/uploads/"):
        return f"{base}{path}"
    return image_url


def _recipe_fingerprint(recipe: dict) -> str:
    title = str(recipe.get("title") or recipe.get("name") or "").strip()
    raw_ingredients = recipe.get("ingredients") or []
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


def attach_recipe_images(
    db: Session,
    *,
    user: User,
    recipes: list[dict],
    ingredients: list[str] | None = None,
    base_url: str | None = None,
    max_generate: int | None = None,
) -> list[dict]:
    """
    Attach recipe images to a list of recipe dicts.

    - Uses App Settings (enabled/size/daily limits/max_per_recipe).
    - Uses cache to avoid regenerating identical recipe images.
    - Returns placeholders when disabled/limits reached/errors occur.

    Notes:
    - This is intended for async recipe generation jobs (vision/text) and daily plan generation.
    - It does not mutate DB recipe_history (that is handled by /ai/recipes/image for "generate image" actions).
    """

    if not recipes:
        return recipes

    settings = get_recipe_image_settings(db)
    helper = AIRecipeGenerator()
    cache = CacheService()

    if not settings.enabled:
        helper._attach_placeholders(recipes)
        return recipes

    tier = get_effective_subscription_tier(db, user) or "free"
    effective_tier = "premium" if tier == "premium" else "free"
    daily_limit = settings.premium_daily_limit if effective_tier == "premium" else settings.free_daily_limit
    if daily_limit == 0:
        helper._attach_placeholders(recipes)
        return recipes

    # Default generation budget per response:
    # - attempt up to 3 recipe thumbnails per result set for a better UX.
    # Daily limits still cap total spend.
    if max_generate is None:
        max_generate = 3
    max_generate = max(0, int(max_generate))

    today = datetime.now(timezone.utc).date().isoformat()
    daily_key = f"imggen:{user.id}:{today}:count"

    daily_count = 0
    try:
        raw = cache.get(daily_key)
        daily_count = int(raw) if raw is not None else 0
    except Exception:  # noqa: BLE001
        daily_count = 0

    def can_generate_more() -> bool:
        if max_generate <= 0:
            return False
        if daily_limit == -1:
            return True
        return daily_count < daily_limit

    generated_this_response = 0
    normalized_ingredients = [str(x).strip() for x in (ingredients or []) if isinstance(x, str) and str(x).strip()]

    for recipe in recipes:
        if not isinstance(recipe, dict):
            continue

        # Always start with a placeholder if missing.
        if not recipe.get("image_url"):
            recipe["image_url"] = helper._placeholder_image(recipe)
            recipe["image_source"] = "placeholder"

        fingerprint = _recipe_fingerprint(recipe)
        cached_url = cache.get(f"recipeimg:{fingerprint}:url")
        if cached_url and isinstance(cached_url, str):
            recipe["image_url"] = _normalize_image_url(cached_url, base_url=base_url)
            recipe["image_source"] = "ai"
            continue

        per_recipe_key = f"imggen:{user.id}:{today}:{fingerprint}"
        per_recipe_count = 0
        try:
            raw = cache.get(per_recipe_key)
            per_recipe_count = int(raw) if raw is not None else 0
        except Exception:  # noqa: BLE001
            per_recipe_count = 0

        if per_recipe_count >= settings.max_per_recipe:
            # Can't generate again; keep placeholder.
            continue

        if not can_generate_more():
            continue

        try:
            image_payload = helper.generate_image_for_recipe(
                recipe,
                tier,
                normalized_ingredients or [],
                size=settings.size,
            )
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "Auto recipe image generation failed user_id=%s fp=%s: %s",
                getattr(user, "id", None),
                fingerprint[:10],
                str(exc)[:200],
            )
            continue

        image_url = str(image_payload.get("image_url") or "")
        if not image_url:
            continue

        image_url = _normalize_image_url(image_url, base_url=base_url)

        recipe["image_url"] = image_url
        recipe["image_source"] = "ai"

        # Track successful image generations for admin cost/usage reporting.
        # Note: only count true AI generations (not cached image attaches).
        try:
            provider = (core_settings.recipe_image_provider or "").strip().lower() or "gemini"
            model_used = str(
                core_settings.runware_image_model
                if provider == "runware"
                else core_settings.gemini_image_model
                if provider == "gemini"
                else (core_settings.runware_image_model or core_settings.gemini_image_model or provider or "unknown")
            )
            record_ai_request(
                db,
                user.id,
                tier,
                "recipe_image",
                model_used=model_used,
                tokens_used=0,
                cost_estimate=float(settings.cost_usd or 0.0),
                device_id=None,
            )
        except Exception:  # noqa: BLE001
            pass

        cache.set(per_recipe_key, str(per_recipe_count + 1), ttl_seconds=24 * 60 * 60)
        cache.set(f"{per_recipe_key}:url", str(image_url), ttl_seconds=24 * 60 * 60)
        cache.set(f"recipeimg:{fingerprint}:url", str(image_url), ttl_seconds=60 * 24 * 60 * 60)

        generated_this_response += 1
        if daily_limit != -1:
            daily_count += 1
            cache.set(daily_key, str(daily_count), ttl_seconds=24 * 60 * 60)

        if generated_this_response >= max_generate:
            break

    # Make sure every recipe has at least a placeholder.
    helper._attach_placeholders(recipes)
    return recipes
