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
    - block inputs that need clarification before generation (needs_clarification)
    - exclude clearly problematic items from the "selected ingredients" list (avoid)
    - treat some items as optional (limit/caution)
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
        raw = json.dumps({"version": 2, "tier": tier, "items": normalized}, sort_keys=True)
        return f"ingrisk:{hashlib.sha256(raw.encode()).hexdigest()}"

    def _ruleset_check(self, items: List[str]) -> Dict[str, Dict[str, str]]:
        """
        Small fallback for generic high-glycemic inputs. This is intentionally not a full food database:
        AI handles the broader classification when available.
        """
        needs_detail = {
            "bread": "Please specify the type of bread, such as wholegrain, brown, seeded, sourdough, or whole wheat.",
            "rice": "Please specify the type of rice, such as basmati, brown rice, or a smaller-portion rice option.",
            "pasta": "Please specify the type of pasta, such as whole wheat pasta or high-fiber pasta.",
            "noodles": "Please specify the type of noodles, such as wholegrain noodles or a lower-carb alternative.",
            "cereal": "Please specify the cereal type. Many cereals are high in sugar or refined starch.",
            "potato": "Please specify the potato form and portion, or add a protein and non-starchy vegetables.",
            "potatoes": "Please specify the potato form and portion, or add a protein and non-starchy vegetables.",
            "flour": "Please specify the flour type. Refined flour is not ideal as a main ingredient.",
        }
        avoid = {
            "sugar": "Added sugar is not suitable as a main ingredient for diabetes-friendly recipe generation.",
            "syrup": "Syrup is usually high in fast-acting sugar.",
            "honey": "Honey can raise blood sugar quickly.",
            "jam": "Jam is usually high in added sugar.",
            "fruit juice": "Fruit juice can raise blood sugar quickly.",
            "soda": "Sugary drinks are not suitable for diabetes-friendly recipe generation.",
        }
        result: Dict[str, Dict[str, str]] = {}
        for item in items:
            if item in needs_detail:
                result[item] = {"risk": "needs_clarification", "reason": needs_detail[item]}
            elif item in avoid:
                result[item] = {"risk": "avoid", "reason": avoid[item]}
        return result

    def classify(self, ingredients: List[str], *, tier: str) -> Dict[str, Any]:
        normalized = [self._normalize(i) for i in (ingredients or []) if self._normalize(i)]
        normalized = list(dict.fromkeys(normalized))
        if not normalized:
            return {"risk_by_name": {}, "source": "rules"}

        rules = self._ruleset_check(normalized)

        key = self._cache_key(tier, normalized)
        cached = self.cache.get(key)
        if cached:
            try:
                payload = json.loads(cached)
                if isinstance(payload, dict) and isinstance(payload.get("risk_by_name"), dict):
                    return payload
            except Exception:
                pass

        # If no AI is configured, use the small generic fallback above and default the rest to ok.
        if not self.client:
            risk_by_name = {name: {"risk": "ok", "reason": ""} for name in normalized}
            risk_by_name.update(rules)
            payload = {"risk_by_name": risk_by_name, "source": "rules"}
            self.cache.set(key, json.dumps(payload), ttl_seconds=6 * 60 * 60)
            return payload

        prompt = (
            "You tag ingredients for diabetes-friendly recipe selection.\n"
            "For each ingredient, return risk:\n"
            "- ok: generally fine as a main ingredient\n"
            "- caution: can be used carefully, usually with portion control and balancing foods\n"
            "- limit: usually fine in small amounts but shouldn't drive the recipe (condiments, added fats, sweet sauces)\n"
            "- avoid: not suitable to center diabetes-friendly recipes around (sugary drinks/sweeteners)\n"
            "- needs_clarification: too vague or likely refined/high-glycemic unless the user gives a better type "
            "(examples: bread, rice, pasta, cereal, noodles, flour)\n"
            "Return ONLY JSON: {\"items\":[{\"name\":\"...\",\"risk\":\"ok|caution|limit|avoid|needs_clarification\",\"reason\":\"short\"}]}.\n"
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
                if risk not in {"ok", "caution", "limit", "avoid", "needs_clarification"}:
                    risk = "ok"
                risk_by_name[name] = {"risk": risk, "reason": reason}

            # The small ruleset wins for generic high-glycemic terms.
            risk_by_name.update(rules)

            # Default any missing items to ok.
            for name in normalized:
                risk_by_name.setdefault(name, {"risk": "ok", "reason": ""})

            payload = {"risk_by_name": risk_by_name, "source": "ai"}
            self.cache.set(key, json.dumps(payload), ttl_seconds=6 * 60 * 60)
            return payload
        except (OpenAIError, json.JSONDecodeError, ValueError) as exc:
            logger.info("Ingredient risk classification failed: %s", str(exc)[:160])
            risk_by_name = {name: {"risk": "ok", "reason": ""} for name in normalized}
            risk_by_name.update(rules)
            payload = {"risk_by_name": risk_by_name, "source": "fallback"}
            self.cache.set(key, json.dumps(payload), ttl_seconds=60 * 60)
            return payload

