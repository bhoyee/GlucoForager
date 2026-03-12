import hashlib
import json
import logging
from typing import Any, Dict, List

from openai import OpenAI, OpenAIError

from ..core.config import settings
from .cache_service import CacheService

logger = logging.getLogger(__name__)


class DiabetesFriendlyClassifier:
    def __init__(self) -> None:
        self.client = (
            OpenAI(api_key=settings.openai_api_key, organization=settings.openai_organization)
            if settings.openai_api_key
            else None
        )
        self.model = settings.openai_model
        self.cache = CacheService()

    def _cache_key(self, ingredients: List[str]) -> str:
        raw = json.dumps(sorted(ingredients), sort_keys=True)
        return f"diabetes_friendly:{hashlib.sha256(raw.encode()).hexdigest()}"

    def _ruleset_check(self, ingredients: List[str]) -> Dict[str, Any]:
        lowered = [item.lower() for item in ingredients]
        beverage_keywords = [
            "water",
            "soda",
            "cola",
            "juice",
            "beer",
            "wine",
            "alcohol",
            "drink",
            "tea",
            "coffee",
            "energy drink",
            "sports drink",
            "milkshake",
            "smoothie",
        ]
        friendly_keywords = [
            "vegetable",
            "spinach",
            "broccoli",
            "chicken",
            "turkey",
            "fish",
            "salmon",
            "egg",
            "tofu",
            "beans",
            "lentil",
            "quinoa",
            "oats",
            "nuts",
            "avocado",
            "olive oil",
            "tomato",
            "pepper",
            "cucumber",
            "zucchini",
            "cauliflower",
            "kale",
            "berry",
            "yogurt",
            "whole grain",
            "brown rice",
            "chickpea",
            "greek yogurt",
        ]
        avoid_keywords = [
            "candy",
            "soda",
            "cola",
            "cake",
            "cookie",
            "donut",
            "pastry",
            "ice cream",
            "fries",
            "chips",
            "chocolate",
            "syrup",
            "sugar",
            "beer",
            "alcohol",
            "white bread",
            "sweetened",
            "energy drink",
        ]

        only_beverages = all(any(key in item for key in beverage_keywords) for item in lowered)
        if only_beverages:
            return {
                "diabetes_friendly": False,
                "reason": "No cookable ingredients detected.",
                "risk_level": "high",
                "source": "rules",
            }

        friendly_hits = any(any(key in item for key in friendly_keywords) for item in lowered)
        avoid_hits = any(any(key in item for key in avoid_keywords) for item in lowered)

        if avoid_hits and not friendly_hits:
            return {
                "diabetes_friendly": False,
                "reason": "Ingredients appear high in added sugar or refined carbs.",
                "risk_level": "high",
                "source": "rules",
            }

        return {
            "diabetes_friendly": True,
            "reason": "Ingredients include diabetes-friendly items.",
            "risk_level": "low" if friendly_hits else "moderate",
            "source": "rules",
        }

    def classify(self, ingredients: List[str]) -> Dict[str, Any]:
        if not ingredients:
            return {
                "diabetes_friendly": False,
                "reason": "No ingredients detected.",
                "risk_level": "high",
                "source": "rules",
            }

        key = self._cache_key(ingredients)
        cached = self.cache.get(key)
        if cached:
            try:
                return json.loads(cached)
            except Exception:
                pass

        if not self.client:
            result = self._ruleset_check(ingredients)
            self.cache.set(key, json.dumps(result), ttl_seconds=3600)
            return result

        prompt = (
            "You are a diabetes nutrition specialist. "
            "Given this ingredient list, decide if it is suitable to generate diabetes-friendly recipes. "
            "Respond ONLY with JSON: {\"diabetes_friendly\": true|false, \"reason\": \"...\", \"risk_level\": \"low|moderate|high\"}."
        )
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": ", ".join(ingredients)},
                ],
                temperature=0.1,
                max_tokens=120,
            )
            content = resp.choices[0].message.content or ""
            result = json.loads(content)
            if "diabetes_friendly" not in result:
                raise ValueError("Invalid classifier response")
            result["source"] = "ai"
            self.cache.set(key, json.dumps(result), ttl_seconds=3600)
            return result
        except (OpenAIError, ValueError, json.JSONDecodeError) as exc:
            logger.warning("Classifier failed, using ruleset. err=%s", exc)
            result = self._ruleset_check(ingredients)
            self.cache.set(key, json.dumps(result), ttl_seconds=3600)
            return result
