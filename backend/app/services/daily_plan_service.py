import json
import logging
from datetime import date
from typing import Any
import uuid

from openai import OpenAI, OpenAIError

from ..core.config import settings

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are a nutrition assistant helping users plan diabetes-friendly meals.

Goal:
- Create a simple daily meal plan for TODAY: breakfast, lunch, dinner, and one snack.

Rules:
- Respect allergies/intolerances, dietary pattern, and foods to avoid STRICTLY.
- Prefer realistic everyday meals (grocery/restaurant common).
- Avoid extreme diets unless required by the user's dietary pattern.
- Avoid medical claims and guaranteed outcomes.
- Keep portions practical and mention a simple portion tip per meal.
- Include light nutrition estimates as ranges (do not claim precision).
- Keep the plan concise and easy to follow.

Hard limits (MUST follow to avoid truncation):
- EXACTLY 4 meals: breakfast, lunch, dinner, snack (no extras).
- For each meal:
  - description: 1 short sentence
  - ingredients: 4-7 items max
  - steps: 3-5 steps max
  - note: 1 short sentence
  - nutrition_estimate: short ranges only (e.g. \"350-450 kcal\", \"25-35g\")
- Do not include raw newlines inside JSON strings.

Return ONLY valid JSON with this exact shape:
{
  "plan_date": "YYYY-MM-DD",
  "meals": [
    {
      "meal": "breakfast" | "lunch" | "dinner" | "snack",
      "title": "string",
      "description": "string",
      "ingredients": ["string", "..."],
      "steps": ["string", "..."],
      "time_minutes": 0,
      "note": "string",
      "nutrition_estimate": {
        "calories": "350-450 kcal",
        "carbs_g": "10-20g",
        "protein_g": "15-25g",
        "fiber_g": "5-10g"
      }
    }
  ],
  "summary": "string",
  "daily_nutrition_estimate": {
    "calories": "1600-2000 kcal",
    "carbs_g": "80-120g",
    "protein_g": "80-120g",
    "fiber_g": "25-35g"
  }
}
"""


def _parse_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.replace("json", "", 1).strip()
    try:
        data = json.loads(raw)
    except Exception:
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


def _clean_list(value: Any, *, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str):
            s = item.strip()
            if s:
                out.append(s)
        if len(out) >= limit:
            break
    return out


def _clean_range(value: Any, *, fallback: str = "") -> str:
    if not isinstance(value, str):
        return fallback
    s = value.strip()
    if not s:
        return fallback
    # Keep compact for UI. Don't try to validate units too hard.
    return s[:24]


def _normalize_nutrition(value: Any) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    calories = _clean_range(value.get("calories"), fallback="")
    carbs = _clean_range(value.get("carbs_g"), fallback="")
    protein = _clean_range(value.get("protein_g"), fallback="")
    fiber = _clean_range(value.get("fiber_g"), fallback="")
    out = {"calories": calories, "carbs_g": carbs, "protein_g": protein, "fiber_g": fiber}
    # If everything is empty, drop it.
    if not any(out.values()):
        return None
    return out


def _normalize_payload(data: dict[str, Any], *, expected_date: date) -> dict[str, Any] | None:
    plan_date = data.get("plan_date")
    if not isinstance(plan_date, str) or not plan_date.strip():
        plan_date = expected_date.isoformat()

    meals_raw = data.get("meals")
    if not isinstance(meals_raw, list) or not meals_raw:
        return None

    def normalize_slot(value: Any) -> str | None:
        raw = str(value or "").strip().lower()
        if not raw:
            return None
        # Accept common variations.
        if "breakfast" in raw or raw in {"morning", "am"}:
            return "breakfast"
        if "lunch" in raw or raw in {"midday", "noon"}:
            return "lunch"
        if "dinner" in raw or "supper" in raw or raw in {"evening", "pm"}:
            return "dinner"
        if raw.startswith("snack") or raw.startswith("snacks") or "snack" in raw:
            return "snack"
        if raw in {"breakfast", "lunch", "dinner", "snack"}:
            return raw
        return None

    # Keep exactly one item per slot; tolerate extra items by ignoring them.
    by_slot: dict[str, dict[str, Any]] = {}
    for item in meals_raw:
        if not isinstance(item, dict):
            continue
        slot = normalize_slot(item.get("meal"))
        if not slot or slot in by_slot:
            continue

        title = str(item.get("title") or "").strip()[:90]
        if not title:
            continue

        description = str(item.get("description") or "").strip()[:220]
        note = str(item.get("note") or "").strip()[:240]
        time_minutes = item.get("time_minutes")
        try:
            time_minutes_int = int(time_minutes) if time_minutes is not None else 0
        except Exception:
            time_minutes_int = 0
        time_minutes_int = max(0, min(180, time_minutes_int))

        ingredients = _clean_list(item.get("ingredients"), limit=14)
        steps = _clean_list(item.get("steps"), limit=10)
        nutrition = _normalize_nutrition(item.get("nutrition_estimate"))

        by_slot[slot] = {
            "meal": slot,
            "title": title,
            "description": description,
            "ingredients": ingredients,
            "steps": steps,
            "time_minutes": time_minutes_int,
            "note": note,
            "nutrition_estimate": nutrition,
        }

    if set(by_slot.keys()) != {"breakfast", "lunch", "dinner", "snack"}:
        return None

    normalized_meals = [by_slot["breakfast"], by_slot["lunch"], by_slot["dinner"], by_slot["snack"]]

    summary = data.get("summary")
    summary_text = summary.strip()[:360] if isinstance(summary, str) else ""
    daily_nutrition = _normalize_nutrition(data.get("daily_nutrition_estimate"))

    # Stable ordering for UI.
    order = {"breakfast": 1, "lunch": 2, "dinner": 3, "snack": 4}
    normalized_meals.sort(key=lambda m: order.get(m["meal"], 99))

    return {
        "plan_date": plan_date,
        "meals": normalized_meals,
        "summary": summary_text,
        "daily_nutrition_estimate": daily_nutrition,
    }


class DailyPlanService:
    def __init__(self) -> None:
        self._client = OpenAI(api_key=settings.openai_api_key, organization=settings.openai_organization)
        self._model = getattr(settings, "daily_plan_model", None) or settings.openai_model or "gpt-4o-mini"

    def _call(
        self,
        *,
        plan_date: date,
        profile_instructions: str | None,
        timeout_seconds: float,
        temperature: float,
        extra_hint: str | None = None,
        max_tokens: int = 1400,
    ) -> dict[str, Any]:
        user_prompt = f"""Plan date: {plan_date.isoformat()}
{(profile_instructions + chr(10)) if profile_instructions else ""}
{(extra_hint.strip() + chr(10)) if isinstance(extra_hint, str) and extra_hint.strip() else ""}

Create the daily plan for the user.
Return ONLY the required JSON.
"""

        resp = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=float(temperature),
            max_tokens=int(max_tokens),
            response_format={"type": "json_object"},
            timeout=timeout_seconds,
        )

        finish_reason = None
        try:
            finish_reason = resp.choices[0].finish_reason
        except Exception:
            finish_reason = None
        if finish_reason == "length":
            content = (resp.choices[0].message.content or "").strip() if resp and resp.choices else ""
            if settings.ai_log_raw_output:
                logger.warning("Daily plan raw output (truncated): %s", content[:1200])
            raise ValueError("Truncated daily plan output")

        content = (resp.choices[0].message.content or "").strip() if resp and resp.choices else ""
        data = _parse_json_object(content)
        if not data:
            if settings.ai_log_raw_output:
                logger.warning("Daily plan raw output (unparseable): %s", content[:1200])
            raise ValueError("Unparseable daily plan output")
        normalized = _normalize_payload(data, expected_date=plan_date)
        if not normalized:
            if settings.ai_log_raw_output:
                logger.warning("Daily plan raw output (invalid payload): %s", content[:1200])
            raise ValueError("Invalid daily plan payload")
        return normalized

    def generate(
        self,
        *,
        plan_date: date,
        profile_instructions: str | None,
        avoid_titles: list[str] | None = None,
        variation_seed: str | None = None,
        timeout_seconds: float = 18.0,
    ) -> dict[str, Any]:
        if not settings.openai_api_key:
            raise RuntimeError("AI is not configured (missing OPENAI_API_KEY).")

        normalized_avoid = []
        if isinstance(avoid_titles, list):
            for item in avoid_titles:
                if not isinstance(item, str):
                    continue
                s = item.strip()
                if s:
                    normalized_avoid.append(s)
        normalized_avoid = list(dict.fromkeys(normalized_avoid))[:12]

        extra_hint_parts: list[str] = []
        if normalized_avoid:
            joined = "; ".join(normalized_avoid)
            extra_hint_parts.append(
                "Variety: Do NOT repeat meals with titles similar to these recent meals: "
                f"{joined}. Choose different dishes and ingredients."
            )
        # Seed nudges the model toward variety when users force-regenerate; it is not user-visible.
        seed = (variation_seed or "").strip() or uuid.uuid4().hex[:10]
        extra_hint_parts.append(f"Variation seed: {seed}")
        extra_hint = "\n".join(extra_hint_parts).strip() if extra_hint_parts else None

        try:
            normalized = self._call(
                plan_date=plan_date,
                profile_instructions=profile_instructions,
                timeout_seconds=timeout_seconds,
                temperature=0.3,
                max_tokens=1400,
                extra_hint=extra_hint,
            )
        except OpenAIError as exc:
            logger.warning("Daily plan OpenAI call failed: %s", str(exc))
            raise
        except ValueError as exc:
            # One retry with a stricter hint (models can sometimes omit the snack or add extras).
            try:
                normalized = self._call(
                    plan_date=plan_date,
                    profile_instructions=profile_instructions,
                    timeout_seconds=min(float(timeout_seconds), 14.0),
                    temperature=0.2,
                    max_tokens=1400,
                    extra_hint=(
                        "IMPORTANT: Include EXACTLY 4 meals: breakfast, lunch, dinner, snack. "
                        "Do not include extra meals. Ensure nutrition_estimate is present for each meal "
                        "and daily_nutrition_estimate is present at the top level."
                        " Keep it SHORT: max 7 ingredients and max 5 steps per meal."
                    ),
                )
            except Exception:
                raise exc

        return {"provider": "openai", "model": self._model, **normalized}
