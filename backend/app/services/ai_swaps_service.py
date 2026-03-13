import json
import logging
from typing import Any, Dict, List

from openai import OpenAI, OpenAIError

from ..core.config import settings

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are a nutrition assistant helping users manage blood sugar.

When a user enters a food or drink, suggest healthier alternatives that may have a lower impact on blood sugar.

Rules:
- Accept any food or drink (meals, snacks, drinks, desserts).
- Suggest 5 realistic alternatives that are easier on blood sugar.
- Avoid extreme diets unless necessary.
- Focus on common grocery-store or restaurant options.
- Include a short explanation.
- Include portion guidance if the user still chooses the original food.
- Keep responses concise and practical.

Return ONLY valid JSON with this exact shape:
{
  "better_options": ["...", "...", "...", "...", "..."],
  "why_these_are_better": "...",
  "portion_tip": "..."
}
"""


def _clean_food(value: str) -> str:
    return " ".join((value or "").strip().split())[:80]


def _parse_json_object(text: str) -> Dict[str, Any] | None:
    if not text:
        return None
    raw = text.strip()
    # Common: model wraps JSON in code fences.
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.replace("json", "", 1).strip()
    try:
        data = json.loads(raw)
    except Exception:
        # Try to extract first {...} block.
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(raw[start : end + 1])
            except Exception:
                return None
        else:
            return None
    return data if isinstance(data, dict) else None


def _normalize_payload(data: Dict[str, Any]) -> Dict[str, Any] | None:
    opts = data.get("better_options")
    why = data.get("why_these_are_better")
    portion = data.get("portion_tip")
    if not isinstance(opts, list) or len(opts) < 3:
        return None
    cleaned: List[str] = []
    for item in opts:
        if isinstance(item, str):
            s = item.strip()
            if s:
                cleaned.append(s)
        if len(cleaned) >= 5:
            break
    if len(cleaned) < 3:
        return None
    if not isinstance(why, str) or not why.strip():
        return None
    if not isinstance(portion, str) or not portion.strip():
        return None
    return {
        "better_options": cleaned[:5],
        "why_these_are_better": why.strip()[:320],
        "portion_tip": portion.strip()[:240],
    }


class AISwapsService:
    def __init__(self) -> None:
        self._openai = OpenAI(api_key=settings.openai_api_key, organization=settings.openai_organization)
        self._model = getattr(settings, "swaps_model", None) or "gpt-4o-mini-2024-07-18"

    def generate_swaps(self, *, food: str, timeout_seconds: float = 12.0) -> Dict[str, Any]:
        food_clean = _clean_food(food)
        if not food_clean:
            raise ValueError("food is required")

        user_prompt = f"""User food: {food_clean}

Suggest 5 diabetes-friendly alternatives that may have lower blood sugar impact.
Return ONLY the required JSON.
"""

        try:
            resp = self._openai.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.4,
                max_tokens=220,
                timeout=timeout_seconds,
            )
        except OpenAIError as e:
            logger.warning("AI swaps OpenAI call failed: %s", str(e))
            raise

        content = (resp.choices[0].message.content or "").strip() if resp and resp.choices else ""
        data = _parse_json_object(content)
        if not data:
            raise ValueError("Unparseable AI swaps output")
        normalized = _normalize_payload(data)
        if not normalized:
            raise ValueError("Invalid AI swaps payload")
        return {
            "food": food_clean,
            "provider": "openai",
            "model": self._model,
            **normalized,
        }

