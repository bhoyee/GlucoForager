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
            # Avoid compounding delays from internal retries; keep this fast.
            self.client = OpenAI(
                api_key=settings.openai_api_key,
                organization=settings.openai_organization,
                max_retries=0,
            )
            self.model = settings.openai_model
            self.base_url = str(getattr(self.client, "base_url", ""))
        elif settings.deepseek_api_key:
            self.client = OpenAI(
                api_key=settings.deepseek_api_key,
                base_url=settings.deepseek_base_url,
                max_retries=0,
            )
            self.model = settings.deepseek_model
            self.base_url = settings.deepseek_base_url
        else:
            self.client = None
            self.model = ""
            self.base_url = ""
        self.cache = CacheService()

    def _cache_key(self, item: str) -> str:
        raw = self._normalize(item)
        return f"foodclass:{hashlib.sha256(raw.encode()).hexdigest()}"

    def _load_cached(self, item: str) -> str | None:
        cached = self.cache.get(self._cache_key(item))
        if not cached:
            return None
        return cached

    def _save_cached(self, item: str, label: str) -> None:
        self.cache.set(self._cache_key(item), label, ttl_seconds=86400)

    def _normalize(self, item: str) -> str:
        return " ".join(item.strip().lower().split())

    def _rule_label(self, item: str) -> str | None:
        lowered = item.strip().lower()
        non_food_keywords = [
            "python",
            "code",
            "script",
            "openai",
            "hack",
            "api",
            "sql",
            "select",
            "insert",
            "update",
            "delete",
            "drop",
            "table",
            "server",
            "localhost",
            "http",
            "https",
            "error",
            "exception",
            "stacktrace",
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
        to_classify: Dict[str, str] = {}
        normalized_items: List[tuple[str, str]] = []
        for item in ingredients:
            normalized = self._normalize(item)
            if not normalized:
                continue
            normalized_items.append((item, normalized))
            cached = self._load_cached(normalized)
            if cached:
                cached_labels[normalized] = cached
            else:
                to_classify.setdefault(normalized, item)

        labels: Dict[str, str] = dict(cached_labels)

        if to_classify and self.client:
            prompt = (
                "You are a strict ingredient validator. For each item, mark if it is a real food ingredient "
                "or a non-food term. Return ONLY JSON in this format: "
                '{"items":[{"item":"<string>","is_food":true|false}]}. '
                "Use the exact item strings from the input list."
            )
            try:
                input_items = list(to_classify.values())
                params: Dict[str, Any] = {
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "You classify food ingredients."},
                        {"role": "user", "content": prompt},
                        {"role": "user", "content": json.dumps(input_items)},
                    ],
                    "temperature": 0,
                }
                if "openai" in self.base_url or self.base_url in ("", "None"):
                    params["response_format"] = {"type": "json_object"}
                # Keep classification fast so it doesn't dominate the overall recipe generation time.
                resp = self.client.chat.completions.create(**params, timeout=6.0)
                content = resp.choices[0].message.content or ""
                payload = json.loads(content)
                items = payload.get("items", [])
                for entry in items:
                    name = entry.get("item")
                    is_food = entry.get("is_food")
                    if isinstance(name, str):
                        normalized = self._normalize(name)
                        if not normalized:
                            continue
                        label = "food" if is_food else "non_food"
                        labels[normalized] = label
                        self._save_cached(normalized, label)
            except (OpenAIError, json.JSONDecodeError, ValueError) as exc:
                logger.warning("Ingredient classification failed: %s", exc)

        # Default: allow items that were not classified (avoid false negatives)
        food = []
        non_food = []
        for item, normalized in normalized_items:
            label = labels.get(normalized)
            if not label:
                label = self._rule_label(item)
                if label:
                    labels[normalized] = label
                    self._save_cached(normalized, label)
            if label == "non_food":
                non_food.append(item)
            else:
                food.append(item)

        source = "ai" if self.client else "rules"
        return {"food": food, "non_food": non_food, "source": source}


class IngredientNormalizer:
    """Normalize typed ingredient names without relying on a hardcoded typo list."""

    def __init__(self) -> None:
        if settings.openai_api_key:
            self.client = OpenAI(
                api_key=settings.openai_api_key,
                organization=settings.openai_organization,
                max_retries=0,
            )
            self.model = settings.openai_model
            self.base_url = str(getattr(self.client, "base_url", ""))
        elif settings.deepseek_api_key:
            self.client = OpenAI(
                api_key=settings.deepseek_api_key,
                base_url=settings.deepseek_base_url,
                max_retries=0,
            )
            self.model = settings.deepseek_model
            self.base_url = settings.deepseek_base_url
        else:
            self.client = None
            self.model = ""
            self.base_url = ""
        self.cache = CacheService()

    def _normalize_text(self, item: str) -> str:
        return " ".join(item.strip().lower().split())

    def _cache_key(self, item: str) -> str:
        raw = self._normalize_text(item)
        return f"foodnorm:{hashlib.sha256(raw.encode()).hexdigest()}"

    def _load_cached(self, item: str) -> str | None:
        cached = self.cache.get(self._cache_key(item))
        return cached if isinstance(cached, str) and cached.strip() else None

    def _save_cached(self, item: str, normalized: str) -> None:
        self.cache.set(self._cache_key(item), normalized, ttl_seconds=86400)

    def normalize(self, ingredients: List[str]) -> Dict[str, Any]:
        cleaned: List[str] = []
        for item in ingredients or []:
            if not isinstance(item, str):
                continue
            normalized = " ".join(item.strip().split())
            if normalized:
                cleaned.append(normalized)
        if not cleaned:
            return {"ingredients": [], "corrections": [], "source": "rules"}

        normalized_by_input: Dict[str, str] = {}
        to_normalize: Dict[str, str] = {}
        for item in cleaned:
            key = self._normalize_text(item)
            cached = self._load_cached(key)
            if cached:
                normalized_by_input[key] = cached
            else:
                to_normalize.setdefault(key, item)

        if to_normalize and self.client:
            prompt = (
                "Normalize typed food ingredient names for recipe generation. Correct obvious spelling, spacing, "
                "singular/plural issues, and clear food-form names into the usual recipe ingredient name. "
                "Do not replace one food with a different unrelated food, do not add extra ingredients, "
                "and do not make diabetes judgments here. If the intended food is unclear, keep "
                "the original text. Return ONLY JSON in this format: "
                '{"items":[{"input":"<exact input>","normalized":"<normalized ingredient>"}]}. '
                "Use the exact input strings from the input list."
            )
            try:
                input_items = list(to_normalize.values())
                params: Dict[str, Any] = {
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "You normalize food ingredient text."},
                        {"role": "user", "content": prompt},
                        {"role": "user", "content": json.dumps(input_items)},
                    ],
                    "temperature": 0,
                }
                if "openai" in self.base_url or self.base_url in ("", "None"):
                    params["response_format"] = {"type": "json_object"}
                resp = self.client.chat.completions.create(**params, timeout=5.0)
                content = resp.choices[0].message.content or ""
                payload = json.loads(content)
                for entry in payload.get("items", []):
                    raw = entry.get("input")
                    normalized = entry.get("normalized")
                    if not isinstance(raw, str) or not isinstance(normalized, str):
                        continue
                    raw_key = self._normalize_text(raw)
                    if raw_key not in to_normalize:
                        continue
                    value = " ".join(normalized.strip().split())
                    if not value:
                        value = to_normalize[raw_key]
                    normalized_by_input[raw_key] = value
                    self._save_cached(raw_key, value)
            except (OpenAIError, json.JSONDecodeError, ValueError) as exc:
                logger.warning("Ingredient normalization failed: %s", exc)

        result: List[str] = []
        seen: set[str] = set()
        corrections: List[Dict[str, str]] = []
        for item in cleaned:
            key = self._normalize_text(item)
            normalized = normalized_by_input.get(key) or item
            normalized = " ".join(normalized.strip().split())
            dedupe_key = self._normalize_text(normalized)
            if not normalized or dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            result.append(normalized)
            if dedupe_key != key:
                corrections.append({"from": item, "to": normalized})

        source = "ai" if self.client else "rules"
        return {"ingredients": result, "corrections": corrections, "source": source}
