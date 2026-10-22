"""Fast "recipes from my ingredients": cards first, full recipes in parallel, bank first.

1. Recipe bank: up to 2 recipes this fridge can already cook (instant, with photos).
2. Cards: one short AI call for the remaining recipes - title, one line, meal type,
   main ingredients, time, carbs (~2-3 s). Shown to the user straight away.
3. In parallel: photos for the new cards, and one AI call per recipe for the full
   ingredients and steps (~4-6 s), instead of one long call for all three (~15 s).

Any failure raises FastPathError so the caller can fall back to the original pipeline.
"""

from __future__ import annotations

import copy
import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from openai import OpenAI

from ..core.config import settings
from ..database import SessionLocal
from ..models.recipe_history import RecipeHistory
from ..models.user import User
from . import recipe_bank
from .cache_service import CacheService
from .cost_tracker import record_ai_request
from .food_profile_service import build_food_profile_instructions, extract_food_profile
from .recipe_image_attach_service import _recipe_fingerprint, attach_recipe_images
from .recipe_keys import title_key

logger = logging.getLogger(__name__)

# ~2x faster than gpt-4o-mini for these short calls (cards 2.3s, full recipe 2.9s), same quality.
MODEL = "gpt-4.1-mini"
CARDS_TIMEOUT = 20.0
DETAIL_TIMEOUT = 30.0
IMAGE_WAIT_AFTER_DETAILS = 6.0
ALLERGENS = ["dairy", "eggs", "fish", "shellfish", "peanuts", "tree_nuts", "soy", "wheat_gluten", "sesame"]

PANTRY_RULE = (
    "You may add only basic pantry staples in small amounts: water, salt, pepper, dried herbs/spices, "
    "lemon/lime, vinegar, garlic, onion, olive oil. Do not add other non-pantry ingredients."
)


class FastPathError(RuntimeError):
    pass


def _client() -> OpenAI:
    if not settings.openai_api_key:
        raise FastPathError("openai_not_configured")
    return OpenAI(api_key=settings.openai_api_key, max_retries=1)


def _ask(prompt: str, *, max_tokens: int, timeout: float, temperature: float = 0.6) -> dict:
    resp = _client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You are a diabetes-safe recipe generator. Respond with a single valid JSON object and no other text."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=timeout,
    )
    try:
        return json.loads(resp.choices[0].message.content or "{}")
    except Exception as exc:  # noqa: BLE001
        raise FastPathError("invalid_json") from exc


def _profile_text(profile: dict | None) -> str:
    try:
        return build_food_profile_instructions(profile, strength="soft", mode="ingredients", has_ingredients=True) or ""
    except Exception:  # noqa: BLE001
        return ""


def _cards(ingredients: list[str], n: int, *, filters: list[str], avoid: list[str], profile_text: str) -> list[dict]:
    prompt = (
        f"Plan {n} different diabetes-friendly recipes using these selected ingredients: {', '.join(ingredients)}.\n\n"
        "RULES:\n"
        "- Use the selected ingredients as the main ingredients; each recipe must use at least 2 of them.\n"
        f"- {PANTRY_RULE}\n"
        f"- Make the {n} recipes clearly different (different dish types or cooking methods).\n"
        "- Titles must sound like real dishes. Keep every string single-line.\n"
        + (f"- Do not reuse or closely copy these titles: {', '.join(avoid[:30])}.\n" if avoid else "")
        + (f"- Apply dietary filters: {', '.join(filters)}.\n" if filters else "")
        + "\nReturn ONLY JSON: {\"recipes\": [{\"title\": \"...\", \"description\": \"1 sentence why it is diabetes-friendly\", "
        "\"meal_type\": \"breakfast|lunch|dinner|snack\", \"main_ingredients\": [\"from the selected list\"], "
        "\"total_time\": <minutes>, \"carbs\": <estimated grams per serving>, \"difficulty\": \"Easy\"}]}"
        + (f"\n\n{profile_text}" if profile_text else "")
    )
    data = _ask(prompt, max_tokens=700, timeout=CARDS_TIMEOUT, temperature=0.7)
    cards = []
    for c in (data.get("recipes") or [])[:n]:
        if not isinstance(c, dict) or not str(c.get("title") or "").strip():
            continue
        cards.append(c)
    if len(cards) < n:
        raise FastPathError(f"too_few_cards:{len(cards)}")
    return cards


def _detail(card: dict, ingredients: list[str], *, filters: list[str], profile_text: str) -> dict:
    title = str(card.get("title")).strip()
    prompt = (
        f"Write the full diabetes-friendly recipe for \"{title}\": {card.get('description') or ''}\n"
        f"Selected ingredients available: {', '.join(ingredients)}. "
        f"Main ingredients for this dish: {', '.join(str(x) for x in (card.get('main_ingredients') or []))}.\n\n"
        "RULES:\n"
        f"- Keep the title exactly \"{title}\".\n"
        "- Use the selected ingredients as the main ingredients (at least 2 of them).\n"
        f"- {PANTRY_RULE}\n"
        "- Max 8 ingredients and 5-6 instruction steps with concrete details (minutes, heat, action).\n"
        "- Keep every string single-line. If ingredients are starchy or sugary, keep portions modest.\n"
        "- Nutrition is per serving: estimate it for THIS recipe from its ingredients and portions "
        "(never reuse placeholder or example numbers).\n"
        + (f"- Apply dietary filters: {', '.join(filters)}.\n" if filters else "")
        + "\nReturn ONLY JSON: {\"recipe\": {\"title\": \"...\", \"description\": \"1 sentence\", "
        "\"meal_type\": \"breakfast|lunch|dinner|snack\", \"prep_time\": 10, \"cook_time\": 15, \"total_time\": 25, "
        "\"servings\": 2, \"difficulty\": \"Easy\", \"ingredients\": [{\"name\": \"ingredient\", \"quantity\": 1, \"unit\": \"cup\"}], "
        "\"instructions\": [\"Step 1\", \"Step 2\", \"Step 3\", \"Step 4\", \"Step 5\"], "
        "\"nutritional_info\": {\"calories\": <number>, \"carbs\": <number>, \"protein\": <number>, \"fat\": <number>, "
        "\"fiber\": <number>, \"sugar\": <number>}, "
        f"\"tags\": [\"diabetes-friendly\"], \"allergen_tags\": [\"only from: {', '.join(ALLERGENS)}\"]}}}}"
        + (f"\n\n{profile_text}" if profile_text else "")
    )
    data = _ask(prompt, max_tokens=1100, timeout=DETAIL_TIMEOUT, temperature=0.4)
    recipe = data.get("recipe") if isinstance(data.get("recipe"), dict) else data
    if not isinstance(recipe, dict):
        raise FastPathError("detail_not_object")
    recipe["title"] = title
    recipe.setdefault("description", card.get("description") or "")
    recipe.setdefault("meal_type", card.get("meal_type"))
    ni = recipe.get("nutritional_info") if isinstance(recipe.get("nutritional_info"), dict) else {}
    ni.setdefault("glycemic_index", None)
    recipe["nutritional_info"] = ni
    recipe.setdefault("tips", [])
    recipe["_ai_provider"] = "openai"
    recipe["_ai_model"] = MODEL
    return recipe


def _card_preview(card: dict) -> dict:
    """What the app shows before the full recipe is written."""
    return {
        "title": str(card.get("title")).strip(),
        "description": card.get("description") or "",
        "meal_type": card.get("meal_type"),
        "total_time": card.get("total_time"),
        "difficulty": card.get("difficulty"),
        "ingredients": [{"name": str(x)} for x in (card.get("main_ingredients") or [])],
        "nutritional_info": {"carbs": card.get("carbs")},
        "image_url": None,
        "image_source": "placeholder",
        "_partial": True,
    }


def _start_images(user_id: int, previews: list[dict], ingredients: list[str], base_url: str | None) -> tuple[threading.Thread, dict]:
    """Photos for new cards, made while the full recipes are being written."""
    result: dict[str, str] = {}

    def run() -> None:
        db = SessionLocal()
        try:
            user = db.get(User, user_id)
            if not user:
                return
            work = [copy.deepcopy(p) for p in previews]
            attach_recipe_images(db, user=user, recipes=work, ingredients=ingredients, base_url=base_url, max_generate=len(work))
            for p in work:
                if p.get("image_source") == "ai" and p.get("image_url"):
                    result[title_key(p["title"])] = p["image_url"]
        except Exception as exc:  # noqa: BLE001
            logger.info("Fast recipes: card images failed: %s", str(exc)[:160])
        finally:
            db.close()

    t = threading.Thread(target=run, name="fast-recipe-images", daemon=True)
    t.start()
    return t, result


def generate(
    db,
    user: User,
    tier: str,
    ingredients: list[str],
    *,
    pipeline,
    filters: list[str] | None = None,
    exclude_titles: list[str] | None = None,
    base_url: str | None = None,
    device_id: str | None = None,
    on_partial: Callable[[list[dict]], None] | None = None,
) -> list[dict]:
    started = time.time()
    filters = list(filters or [])
    capped = pipeline._cap_recipe_ingredients(ingredients)
    pipeline._ensure_diabetes_friendly_or_raise(capped, mode="ingredients", tier=tier)
    exclude = pipeline._merge_disliked_titles(db, user.id, exclude_titles) or []
    profile = extract_food_profile(user)
    profile_text = _profile_text(profile)

    # 1) Bank first. Keep at least one freshly written recipe so results never feel recycled.
    bank = [] if filters else recipe_bank.find_matches(db, user, capped, limit=2, exclude_titles=exclude)
    n = 3 - len(bank)

    # 2) Cards for the rest.
    cards = _cards(capped, n, filters=filters, avoid=[*exclude, *[b["title"] for b in bank]], profile_text=profile_text)
    previews = [_card_preview(c) for c in cards]
    t_cards = time.time() - started
    if on_partial:
        try:
            on_partial([*bank, *previews])
        except Exception:  # noqa: BLE001
            pass

    # 3) Photos and full recipes at the same time.
    img_thread, images = _start_images(user.id, previews, capped, base_url)
    with ThreadPoolExecutor(max_workers=len(cards)) as pool:
        futures = [pool.submit(_detail, c, capped, filters=filters, profile_text=profile_text) for c in cards]
        details = [f.result() for f in futures]  # Raises -> caller falls back.
    t_details = time.time() - started
    img_thread.join(timeout=IMAGE_WAIT_AFTER_DETAILS)

    cache = CacheService()
    for d in details:
        url = images.get(title_key(d["title"]))
        if url:
            d["image_url"] = url
            d["image_source"] = "ai"
            # Same photo for the full recipe (its fingerprint includes every ingredient).
            try:
                cache.set(f"recipeimg:{_recipe_fingerprint(d)}:url", url, ttl_seconds=60 * 24 * 60 * 60)
            except Exception:  # noqa: BLE001
                pass
        else:
            d.setdefault("image_url", None)
            d.setdefault("image_source", "placeholder")

    recipes = [*bank, *details]
    validated = pipeline._validated_recipes_or_none(recipes, mode="ingredients", source_ingredients=ingredients)
    if validated is None:
        raise FastPathError(f"validation:{pipeline._last_recipe_validation_error}")
    # The validator returns cleaned copies; keep the image and bank fields.
    by_title = {title_key(r.get("title") or ""): r for r in recipes}
    for v in validated:
        src = by_title.get(title_key(v.get("title") or "")) or {}
        for k in ("image_url", "image_source", "meal_type", "_bank_id", "_source", "allergen_tags"):
            if k in src and k not in v:
                v[k] = src[k]

    record_ai_request(db, user.id, tier, "text", model_used=MODEL, tokens_used=0, cost_estimate=0, device_id=device_id)
    db.add(RecipeHistory(user_id=user.id, source="text", recipes=validated))
    db.commit()

    # Save the new ones to the bank without making the user wait.
    threading.Thread(target=recipe_bank.save_generated, args=([copy.deepcopy(r) for r in validated],), daemon=True).start()
    logger.info(
        "Fast recipes: bank=%s cards=%.1fs details=%.1fs total=%.1fs images=%s/%s",
        len(bank), t_cards, t_details, time.time() - started, len(images), len(previews),
    )
    return validated
