"""Carb estimate for a typed meal ("jollof rice and chicken" -> ~55g, "Jollof rice").

Typed meals are how most people log homemade food; without a carb number they'd add
nothing to the carb ring or the carb insights. One short call to a small model, cached
by meal text (the same text gives the same answer for everyone), so repeats are free.
Always an estimate - the app labels it as one and lets the user adjust it.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re

from openai import OpenAI

from ..core.config import settings
from .cache_service import CacheService

logger = logging.getLogger(__name__)
cache = CacheService()

MODEL = "gpt-4o-mini"  # small and cheap: ~300 tokens in, ~100 out per estimate
CACHE_TTL_SECONDS = 30 * 24 * 3600
MAX_CARBS_G = 400

SYSTEM_PROMPT = """You estimate carbohydrates for a meal typed into a diabetes food-logging app.
Assume one typical adult serving unless an amount is given (e.g. "2 slices", "half plate").
Know cuisines worldwide, including West African, Caribbean, South Asian and British food.
Count total carbohydrate in grams for the whole meal described.
Plain meat, fish, eggs, oils and butter are about 0g unless breaded, battered or in a sweet sauce.

Return ONLY JSON:
{"recognized": true|false,
 "food_name": "the main dish only, max 3 words, sentence case, no amounts or sides (e.g. 'Jollof rice' for 'jollof rice and chicken')",
 "carbs_g": integer,
 "items": [{"name": "string", "carbs_g": integer}],
 "confidence": "high"|"medium"|"low"}
- items: the main components, at most 5.
- If the text is not food or drink, return {"recognized": false}."""


def normalize(description: str) -> str:
    return re.sub(r"\s+", " ", (description or "").strip().lower())


def _clean(data: dict) -> dict | None:
    if not isinstance(data, dict) or not data.get("recognized"):
        return {"recognized": False}
    try:
        carbs = int(round(float(data.get("carbs_g"))))
    except (TypeError, ValueError):
        return None
    name = re.sub(r"\s+", " ", str(data.get("food_name") or "")).strip()[:60]
    items = []
    for item in (data.get("items") or [])[:5]:
        try:
            items.append({"name": str(item["name"])[:40], "carbs_g": max(0, int(round(float(item["carbs_g"]))))})
        except (KeyError, TypeError, ValueError):
            continue
    confidence = data.get("confidence") if data.get("confidence") in ("high", "medium", "low") else "medium"
    return {
        "recognized": True,
        "food_name": name or None,
        "carbs_g": max(0, min(MAX_CARBS_G, carbs)),
        "items": items,
        "confidence": confidence,
    }


def estimate_meal_carbs(description: str) -> tuple[dict | None, bool]:
    """Returns (estimate or None on failure, from_cache)."""
    text = normalize(description)
    if not text:
        return None, False
    key = "meal_estimate:v2:" + hashlib.sha1(text.encode("utf-8")).hexdigest()
    cached = cache.get(key)
    if cached:
        try:
            return json.loads(cached), True
        except ValueError:
            pass
    if not settings.openai_api_key:
        return None, False
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": text[:200]}],
            temperature=0.2,
            max_tokens=250,
            response_format={"type": "json_object"},
            timeout=12,
        )
        result = _clean(json.loads(resp.choices[0].message.content or "{}"))
    except Exception:  # noqa: BLE001 - an estimate is optional; the meal still saves without it
        logger.warning("Meal carb estimate failed", exc_info=True)
        return None, False
    if result is not None:
        cache.set(key, json.dumps(result), ttl_seconds=CACHE_TTL_SECONDS)
    return result, False
