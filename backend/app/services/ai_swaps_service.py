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
- First decide if the food is already a generally diabetes-friendly choice.
- If it is already a good choice, DO NOT suggest swaps unless the user explicitly asks for substitutions.
- If it is higher-impact (likely to spike), suggest swaps.
- Avoid extreme diets unless necessary.
- Focus on common grocery-store or restaurant options.
- Include a short explanation.
- Include portion guidance if the user still chooses the original food.
- Keep responses concise and practical.

Return ONLY valid JSON with this exact shape:
{
  "assessment": {
    "verdict": "good_choice" | "higher_impact" | "depends",
    "summary": "...",
    "watch_outs": ["...", "..."],
    "pair_with": ["...", "..."],
    "portion_tip": "..."
  },
  "should_show_swaps": true | false,
  "swaps": {
    "better_options": ["...", "...", "...", "...", "..."],
    "why_these_are_better": "...",
    "portion_tip": "..."
  } | null
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


def _normalize_string_list(value: Any, *, limit: int) -> List[str]:
    if not isinstance(value, list):
        return []
    out: List[str] = []
    for item in value:
        if isinstance(item, str):
            s = item.strip()
            if s:
                out.append(s)
        if len(out) >= limit:
            break
    return out


def _normalize_payload(data: Dict[str, Any]) -> Dict[str, Any] | None:
    assessment = data.get("assessment")
    should_show = data.get("should_show_swaps")
    swaps = data.get("swaps")

    if not isinstance(assessment, dict):
        return None
    verdict = str(assessment.get("verdict") or "").strip()
    if verdict not in {"good_choice", "higher_impact", "depends"}:
        return None
    summary = assessment.get("summary")
    portion_tip = assessment.get("portion_tip")
    if not isinstance(summary, str) or not summary.strip():
        return None
    if not isinstance(portion_tip, str) or not portion_tip.strip():
        return None
    watch_outs = _normalize_string_list(assessment.get("watch_outs"), limit=3)
    pair_with = _normalize_string_list(assessment.get("pair_with"), limit=3)

    should_show_bool = bool(should_show)
    normalized_swaps = None
    if should_show_bool:
        if not isinstance(swaps, dict):
            return None
        opts = _normalize_string_list(swaps.get("better_options"), limit=5)
        why = swaps.get("why_these_are_better")
        s_portion = swaps.get("portion_tip")
        if len(opts) < 3:
            return None
        if not isinstance(why, str) or not why.strip():
            return None
        if not isinstance(s_portion, str) or not s_portion.strip():
            return None
        normalized_swaps = {
            "better_options": opts[:5],
            "why_these_are_better": why.strip()[:320],
            "portion_tip": s_portion.strip()[:240],
        }

    return {
        "assessment": {
            "verdict": verdict,
            "summary": summary.strip()[:240],
            "watch_outs": watch_outs,
            "pair_with": pair_with,
            "portion_tip": portion_tip.strip()[:240],
        },
        "should_show_swaps": should_show_bool,
        "swaps": normalized_swaps,
    }


class AISwapsService:
    def __init__(self) -> None:
        self._openai = OpenAI(api_key=settings.openai_api_key, organization=settings.openai_organization)
        self._model = getattr(settings, "swaps_model", None) or "gpt-4o-mini-2024-07-18"

    def generate_swaps(self, *, food: str, force_swaps: bool = False, timeout_seconds: float = 12.0) -> Dict[str, Any]:
        food_clean = _clean_food(food)
        if not food_clean:
            raise ValueError("food is required")

        force_line = "User explicitly asked for substitutions: YES" if force_swaps else "User explicitly asked for substitutions: NO"
        user_prompt = f"""User food: {food_clean}
{force_line}

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
                max_tokens=260,
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
