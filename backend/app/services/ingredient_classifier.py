import hashlib
import json
import logging
from typing import Any, Dict, List

from openai import OpenAI, OpenAIError

from ..core.config import settings
from .cache_service import CacheService

logger = logging.getLogger(__name__)


class IngredientClassifier:
    """Classify ingredient strings as food vs non-food with caching."""

    def __init__(self) -> None:
        if settings.openai_api_key:
            self.client = OpenAI(api_key=settings.openai_api_key)
            self.model = settings.openai_model
            self.base_url = str(getattr(self.client, "base_url", ""))
        elif settings.deepseek_api_key:
            self.client = OpenAI(api_key=settings.deepseek_api_key, base_url=settings.deepseek_base_url)
            self.model = settings.deepseek_model
            self.base_url = settings.deepseek_base_url
        else:
            self.client = None
            self.model = ""
            self.base_url = ""
        self.cache = CacheService()

    def _cache_key(self, item: str) -> str:
        raw = item.strip().lower()
        return f"foodclass:{hashlib.sha256(raw.encode()).hexdigest()}"

    def _load_cached(self, item: str) -> str | None:
        cached = self.cache.get(self._cache_key(item))
        if not cached:
            return None
        return cached

    def _save_cached(self, item: str, label: str) -> None:
        self.cache.set(self._cache_key(item), label, ttl_seconds=86400)

    def _rule_label(self, item: str) -> str | None:
        lowered = item.strip().lower()
        non_food_keywords = [
            "laptop",
            "keyboard",
            "mouse",
            "trackpad",
            "monitor",
            "screen",
            "desk",
            "table",
            "chair",
            "phone",
            "tablet",
            "charger",
            "cable",
            "cord",
            "remote",
            "controller",
            "headphone",
            "headset",
            "speaker",
            "printer",
            "book",
            "notebook",
            "paper",
            "pen",
            "pencil",
            "lamp",
            "mug",
            "cup",
            "plate",
            "bowl",
            "scissors",
            "knife set",
        ]
        if any(keyword in lowered for keyword in non_food_keywords):
            return "non_food"
        return None

    def classify(self, ingredients: List[str]) -> Dict[str, Any]:
        if not ingredients:
            return {"food": [], "non_food": [], "source": "rules"}

        cached_labels: Dict[str, str] = {}
        to_classify: List[str] = []
        for item in ingredients:
            cached = self._load_cached(item)
            if cached:
                cached_labels[item] = cached
            else:
                to_classify.append(item)

        labels: Dict[str, str] = dict(cached_labels)

        if to_classify and self.client:
            prompt = (
                "You are a strict ingredient validator. For each item, mark if it is a real food ingredient "
                "or a non-food term. Return ONLY JSON in this format: "
                '{"items":[{"item":"<string>","is_food":true|false}]}'
            )
            try:
                params: Dict[str, Any] = {
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "You classify food ingredients."},
                        {"role": "user", "content": prompt},
                        {"role": "user", "content": ", ".join(to_classify)},
                    ],
                    "temperature": 0,
                }
                if "openai" in self.base_url or self.base_url in ("", "None"):
                    params["response_format"] = {"type": "json_object"}
                resp = self.client.chat.completions.create(**params)
                content = resp.choices[0].message.content or ""
                payload = json.loads(content)
                items = payload.get("items", [])
                for entry in items:
                    name = entry.get("item")
                    is_food = entry.get("is_food")
                    if isinstance(name, str):
                        label = "food" if is_food else "non_food"
                        labels[name] = label
                        self._save_cached(name, label)
            except (OpenAIError, json.JSONDecodeError, ValueError) as exc:
                logger.warning("Ingredient classification failed: %s", exc)

        # Default: allow items that were not classified (avoid false negatives)
        food = []
        non_food = []
        for item in ingredients:
            label = labels.get(item)
            if not label:
                label = self._rule_label(item)
                if label:
                    labels[item] = label
                    self._save_cached(item, label)
            if label == "non_food":
                non_food.append(item)
            else:
                food.append(item)

        source = "ai" if self.client else "rules"
        return {"food": food, "non_food": non_food, "source": source}
