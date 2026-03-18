import hashlib
import json
import logging
from typing import Any, Dict, List

from openai import OpenAI, OpenAIError

from ..core.config import settings
from .cache_service import CacheService

logger = logging.getLogger(__name__)


class IngredientRiskClassifier:
    """
    AI-driven ingredient risk tagging for diabetes-friendly cooking.

    Output is used to:
    - exclude clearly problematic items from the "selected ingredients" list (avoid)
    - treat some items as optional (limit)
    - keep most items (ok)
    """

    def __init__(self) -> None:
        self.client = (
            OpenAI(api_key=settings.openai_api_key, organization=settings.openai_organization)
            if settings.openai_api_key
            else None
        )
        self.model = settings.openai_model
        self.cache = CacheService()

    def _normalize(self, item: str) -> str:
        return " ".join((item or "").strip().lower().split())

    def _cache_key(self, tier: str, items: List[str]) -> str:
        normalized = sorted({self._normalize(i) for i in (items or []) if self._normalize(i)})
        raw = json.dumps({"tier": tier, "items": normalized}, sort_keys=True)
        return f"ingrisk:{hashlib.sha256(raw.encode()).hexdigest()}"

    def classify(self, ingredients: List[str], *, tier: str) -> Dict[str, Any]:
        normalized = [self._normalize(i) for i in (ingredients or []) if self._normalize(i)]
        normalized = list(dict.fromkeys(normalized))
        if not normalized:
            return {"risk_by_name": {}, "source": "rules"}

        key = self._cache_key(tier, normalized)
        cached = self.cache.get(key)
        if cached:
            try:
                payload = json.loads(cached)
                if isinstance(payload, dict) and isinstance(payload.get("risk_by_name"), dict):
                    return payload
            except Exception:
                pass

        # If no AI configured, do nothing (avoid hardcoding).
        if not self.client:
            payload = {"risk_by_name": {name: {"risk": "ok", "reason": ""} for name in normalized}, "source": "none"}
            self.cache.set(key, json.dumps(payload), ttl_seconds=6 * 60 * 60)
            return payload

        prompt = (
            "You tag ingredients for diabetes-friendly recipe selection.\n"
            "For each ingredient, return risk:\n"
            "- ok: generally fine as a main ingredient\n"
            "- limit: usually fine in small amounts but shouldn't drive the recipe (condiments, added fats, sweet sauces)\n"
            "- avoid: not suitable to center diabetes-friendly recipes around (sugary drinks/sweeteners)\n"
            "Return ONLY JSON: {\"items\":[{\"name\":\"...\",\"risk\":\"ok|limit|avoid\",\"reason\":\"short\"}]}.\n"
            "Do not include medical claims. Keep reasons short and practical."
        )

        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": json.dumps(normalized)},
                ],
                temperature=0.0,
                max_tokens=350,
                timeout=8.0,
                response_format={"type": "json_object"},
            )
            content = resp.choices[0].message.content or ""
            data = json.loads(content)
            items = data.get("items", []) if isinstance(data, dict) else []
            risk_by_name: Dict[str, Dict[str, str]] = {}
            for entry in items:
                if not isinstance(entry, dict):
                    continue
                name = self._normalize(str(entry.get("name") or ""))
                risk = str(entry.get("risk") or "ok").strip().lower()
                reason = str(entry.get("reason") or "").strip()
                if not name:
                    continue
                if risk not in {"ok", "limit", "avoid"}:
                    risk = "ok"
                risk_by_name[name] = {"risk": risk, "reason": reason}

            # Default any missing items to ok.
            for name in normalized:
                risk_by_name.setdefault(name, {"risk": "ok", "reason": ""})

            payload = {"risk_by_name": risk_by_name, "source": "ai"}
            self.cache.set(key, json.dumps(payload), ttl_seconds=6 * 60 * 60)
            return payload
        except (OpenAIError, json.JSONDecodeError, ValueError) as exc:
            logger.info("Ingredient risk classification failed: %s", str(exc)[:160])
            payload = {"risk_by_name": {name: {"risk": "ok", "reason": ""} for name in normalized}, "source": "fallback"}
            self.cache.set(key, json.dumps(payload), ttl_seconds=60 * 60)
            return payload

