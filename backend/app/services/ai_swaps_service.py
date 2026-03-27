import json
import logging
import re
from typing import Any, Dict, List

from openai import OpenAI, OpenAIError

from ..core.config import settings
from ..data.swaps_fallback import FALLBACK_ALIASES, FALLBACK_CATALOG

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are a nutrition assistant helping users manage blood sugar.

When a user enters a food or drink, suggest healthier alternatives that may have a lower impact on blood sugar.

Rules:
- Accept any food or drink (meals, snacks, drinks, desserts).
- Only ask for clarification if the input is not recognizable as a food/drink after a best-effort interpretation.
- If you can reasonably suggest a corrected spelling, include it as suggested_query.
- Always provide swap candidates for recognizable foods/drinks (this endpoint is explicitly "Food swaps").
- For recognizable foods/drinks: set needs_clarification=false, set should_show_swaps=true, and return exactly 6 swap_candidates.
- If the input is not a food or drink, set is_food_or_drink=false and do NOT fabricate swaps.
- When you do not suggest swaps, set should_show_swaps=false and swaps=null.
- Respect allergies/intolerances, dietary pattern, and avoid foods STRICTLY when proposing swaps.
- Avoid extreme diets unless necessary.
- Focus on common grocery-store or restaurant options.
- Keep responses concise and practical, in plain language.
- GI is REQUIRED for every swap candidate: always provide gi_min and gi_max as integers in range 0–110.
  If you are not sure, provide your best estimate range and set gi_note="Estimated".

Return ONLY valid JSON with this exact shape:
{
  "assessment": {
    "is_food_or_drink": true | false,
    "confidence": 0.0,
    "verdict": "good_choice" | "higher_impact" | "depends",
    "needs_clarification": true | false,
    "suggested_query": "..." | null,
    "clarification_question": "..." | null,
    "summary": "...",
    "watch_outs": ["...", "..."],
    "pair_with": ["...", "..."],
    "portion_tip": "..."
  },
  "should_show_swaps": true | false,
  "swaps_explanation": "..." | null,
  "swap_candidates": [
    {
      "name": "...",
      "reason": "...",
      "gi_min": 0,
      "gi_max": 0,
      "gi_note": "Estimated" | "..." | null,
      "serving": "..." | null,
      "net_carbs_g": 0 | null,
      "fiber_g": 0 | null,
      "protein_g": 0 | null,
      "impact_label": "low" | "medium" | "high" | null,
      "portion_suggestion": "..." | null,
      "fit_tags": ["lower_carb", "high_protein", "balanced", "weight_loss", "quick_meals", "simple_ingredients", "budget_friendly", "family_friendly"],
      "cuisine_fit": ["west_african", "british_irish", "mediterranean", "south_asian", "east_asian", "southeast_asian", "latin_american", "european", "mena", "american_canadian", "caribbean", "other", "generic"],
      "estimated_effort": "very_low" | "low" | "medium" | "high",
      "prep_style": "stove" | "microwave" | "no_cook" | "oven" | "air_fryer" | "blender" | "mixed"
    }
  ] | null
}
"""

def _fallback_key(food: str) -> str:
    return _clean_food(food).lower()


def _clean_food(value: str) -> str:
    return " ".join((value or "").strip().split())[:25]


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


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        if isinstance(value, bool):
            return None
        return float(value)
    except Exception:
        return None


def _to_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        if isinstance(value, bool):
            return None
        return int(float(value))
    except Exception:
        return None


_PROFILE_KEYS = {"type_2", "prediabetes", "type_1", "gestational", "managing", "prefer_not"}

_GOAL_KEYS = {
    "lower_carb",
    "high_protein",
    "balanced",
    "weight_loss",
    "quick_meals",
    "simple_ingredients",
    "budget_friendly",
    "family_friendly",
}

_CUISINE_KEYS = {
    "west_african",
    "east_african",
    "mena",
    "british_irish",
    "american_canadian",
    "caribbean",
    "mediterranean",
    "south_asian",
    "east_asian",
    "southeast_asian",
    "latin_american",
    "european",
    "other",
    "generic",
}

_EFFORT_KEYS = {"very_low", "low", "medium", "high"}
_PREP_STYLE_KEYS = {"stove", "microwave", "no_cook", "oven", "air_fryer", "blender", "mixed"}


def _clean_profile_list(values: Any, *, max_items: int = 6) -> list[str]:
    if not isinstance(values, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        if not isinstance(raw, str):
            continue
        s = raw.strip().lower()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
        if len(out) >= max_items:
            break
    return out


def _hard_filter_candidate(name: str, reason: str, *, food_profile: dict[str, Any] | None) -> bool:
    """Return True if candidate should be kept, False if it violates hard constraints."""
    if not food_profile or not isinstance(food_profile, dict):
        return True

    text = f"{name} {reason}".lower()

    allergens = set(_clean_profile_list(food_profile.get("allergens"), max_items=24))
    exclusions = set(_clean_profile_list(food_profile.get("food_exclusions"), max_items=24))
    dietary = str(food_profile.get("dietary_pattern") or "").strip().lower()

    # Allergen keyword mapping (simple, conservative).
    allergen_keywords: dict[str, list[str]] = {
        "dairy": ["milk", "cheese", "yogurt", "butter", "cream", "whey", "casein", "kefir"],
        "eggs": ["egg"],
        "fish": ["fish", "salmon", "tuna", "sardine", "mackerel"],
        "shellfish": ["shrimp", "prawn", "crab", "lobster", "shellfish"],
        "peanuts": ["peanut"],
        "tree_nuts": ["almond", "walnut", "cashew", "pistachio", "pecan", "hazelnut", "macadamia", "nut "],
        "soy": ["soy", "tofu", "edamame", "tempeh"],
        "wheat_gluten": ["wheat", "gluten", "bread", "pasta", "flour", "couscous", "bulgur", "seitan"],
        "sesame": ["sesame", "tahini"],
    }
    for allergen, kws in allergen_keywords.items():
        if allergen in allergens and any(kw in text for kw in kws):
            return False

    exclusion_keywords: dict[str, list[str]] = {
        "pork": ["pork", "bacon", "ham", "pepperoni"],
        "beef": ["beef", "steak"],
        "chicken": ["chicken"],
        "seafood": ["seafood", "fish", "salmon", "tuna", "shrimp", "prawn", "crab", "lobster", "shellfish"],
        "onion_garlic": ["onion", "garlic"],
        "spicy_food": ["spicy", "chili", "chilli", "pepper"],
        "mushrooms": ["mushroom"],
        "alcohol": ["alcohol", "beer", "wine", "vodka", "rum", "whiskey", "cocktail"],
        "caffeine": ["caffeine", "coffee", "espresso", "energy drink"],
    }
    for avoid, kws in exclusion_keywords.items():
        if avoid in exclusions and any(kw in text for kw in kws):
            return False

    # Dietary pattern rules (very simple, to prevent obvious violations).
    if dietary == "vegan":
        if re.search(r"\b(egg|eggs|milk|cheese|yogurt|butter|cream|chicken|beef|pork|fish|shrimp|tuna|salmon|honey)\b", text):
            return False
    elif dietary == "vegetarian":
        if re.search(r"\b(chicken|beef|pork|fish|shrimp|tuna|salmon|bacon|ham)\b", text):
            return False
    elif dietary == "pescatarian":
        if re.search(r"\b(chicken|beef|pork|bacon|ham)\b", text):
            return False
    elif dietary == "halal":
        if re.search(r"\b(pork|bacon|ham)\b", text) or "alcohol" in text:
            return False
    elif dietary == "kosher":
        if re.search(r"\b(pork|bacon|ham|shellfish|shrimp|prawn|crab|lobster)\b", text):
            return False

    return True


def _score_candidate(candidate: dict[str, Any], *, food_profile: dict[str, Any] | None) -> int:
    if not food_profile or not isinstance(food_profile, dict):
        return 0

    score = 0

    goals = set(_clean_profile_list(food_profile.get("meal_goals"), max_items=4))
    cuisines = set(_clean_profile_list(food_profile.get("preferred_cuisines"), max_items=3))
    cook_time = str(food_profile.get("cook_time_preference") or "").strip().lower()
    equipment = set(_clean_profile_list(food_profile.get("available_equipment"), max_items=12))

    tags = set(_clean_profile_list(candidate.get("fit_tags"), max_items=12))
    for goal in goals:
        if goal in tags and goal in _GOAL_KEYS:
            score += 3

    cfit = set(_clean_profile_list(candidate.get("cuisine_fit"), max_items=12))
    for c in cuisines:
        if c in cfit and c in _CUISINE_KEYS:
            score += 2

    effort = str(candidate.get("estimated_effort") or "").strip().lower()
    prep_style = str(candidate.get("prep_style") or "").strip().lower()

    if cook_time == "under_15" and effort in {"very_low", "low"}:
        score += 2
    elif cook_time == "15_30" and effort in {"very_low", "low", "medium"}:
        score += 1

    # Equipment fit (minor bonus).
    if "microwave" in equipment and "microwave" in prep_style:
        score += 1
    if "stove" in equipment and "stove" in prep_style:
        score += 1
    if "air_fryer" in equipment and ("air_fryer" in prep_style or "air fryer" in prep_style):
        score += 1
    if "oven" in equipment and "oven" in prep_style:
        score += 1
    if "blender" in equipment and "blender" in prep_style:
        score += 1
    if "no_cook" in prep_style:
        score += 1

    return score


def _normalize_candidates(raw_candidates: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_candidates, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw_candidates[:10]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        reason = str(item.get("reason") or "").strip()
        if not name:
            continue
        if not reason:
            reason = "May have a lower blood sugar impact than the original (portion still matters)."

        gi_min = _to_int(item.get("gi_min"))
        gi_max = _to_int(item.get("gi_max"))
        if gi_min is not None:
            gi_min = max(0, min(110, gi_min))
        if gi_max is not None:
            gi_max = max(0, min(110, gi_max))
        if gi_min is not None and gi_max is not None and gi_min > gi_max:
            gi_min, gi_max = gi_max, gi_min

        gi_note = item.get("gi_note")
        if gi_note is not None and not isinstance(gi_note, str):
            gi_note = None
        if isinstance(gi_note, str):
            gi_note = gi_note.strip()[:120] or None

        serving = item.get("serving")
        if serving is not None and not isinstance(serving, str):
            serving = None
        if isinstance(serving, str):
            serving = serving.strip()[:60] or None

        net_carbs = _to_float(item.get("net_carbs_g"))
        fiber = _to_float(item.get("fiber_g"))
        protein = _to_float(item.get("protein_g"))
        if net_carbs is not None:
            net_carbs = max(0.0, min(200.0, net_carbs))
        if fiber is not None:
            fiber = max(0.0, min(100.0, fiber))
        if protein is not None:
            protein = max(0.0, min(120.0, protein))

        impact = item.get("impact_label")
        if impact is not None and not isinstance(impact, str):
            impact = None
        if isinstance(impact, str):
            impact = impact.strip().lower()
            if impact not in {"low", "medium", "high"}:
                impact = None

        # GI is required for this feature. If the model omitted it, infer a reasonable estimate
        # from impact_label so the UI always has a range to show.
        if gi_min is None and gi_max is None:
            if impact == "low":
                gi_min, gi_max = 15, 55
            elif impact == "high":
                gi_min, gi_max = 70, 100
            else:
                gi_min, gi_max = 56, 69
            gi_note = gi_note or "Estimated"

        portion_suggestion = item.get("portion_suggestion")
        if portion_suggestion is not None and not isinstance(portion_suggestion, str):
            portion_suggestion = None
        if isinstance(portion_suggestion, str):
            portion_suggestion = portion_suggestion.strip()[:120] or None

        fit_tags = [x for x in _clean_profile_list(item.get("fit_tags"), max_items=10) if x in _GOAL_KEYS]
        cuisine_fit = [x for x in _clean_profile_list(item.get("cuisine_fit"), max_items=10) if x in _CUISINE_KEYS]
        effort = str(item.get("estimated_effort") or "").strip().lower()
        if effort not in _EFFORT_KEYS:
            effort = "medium"
        prep_style = str(item.get("prep_style") or "").strip().lower()
        if prep_style not in _PREP_STYLE_KEYS:
            prep_style = "mixed"
        out.append(
            {
                "name": name[:80],
                "reason": reason[:140],
                "gi": {"min": gi_min, "max": gi_max, "note": gi_note},
                "serving": serving,
                "macros": {
                    "net_carbs_g": round(net_carbs, 1) if isinstance(net_carbs, float) else None,
                    "fiber_g": round(fiber, 1) if isinstance(fiber, float) else None,
                    "protein_g": round(protein, 1) if isinstance(protein, float) else None,
                },
                "impact_label": impact,
                "portion_suggestion": portion_suggestion,
                "fit_tags": fit_tags,
                "cuisine_fit": cuisine_fit,
                "estimated_effort": effort,
                "prep_style": prep_style,
            }
        )
        if len(out) >= 8:
            break
    return out


def _best_options_from_candidates(
    candidates: list[dict[str, Any]],
    *,
    food_profile: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    # Hard filter (safety net).
    kept = [c for c in candidates if _hard_filter_candidate(c.get("name", ""), c.get("reason", ""), food_profile=food_profile)]
    if len(kept) < 3:
        kept = candidates

    # Rank by preferences.
    scored = [(c, _score_candidate(c, food_profile=food_profile)) for c in kept]
    scored.sort(key=lambda x: x[1], reverse=True)

    # Diversity: avoid exact duplicates.
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for c, _ in scored:
        key = " ".join(str(c.get("name") or "").lower().split())
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(c)
        if len(out) >= 8:
            break
    return out


def _normalize_payload(data: Dict[str, Any], *, food_profile: dict[str, Any] | None) -> Dict[str, Any] | None:
    assessment = data.get("assessment")
    should_show = data.get("should_show_swaps")
    raw_candidates = data.get("swap_candidates")
    swaps_explanation = data.get("swaps_explanation")

    if not isinstance(assessment, dict):
        return None
    is_food_or_drink_raw = assessment.get("is_food_or_drink")
    is_food_or_drink = bool(is_food_or_drink_raw)
    confidence_raw = assessment.get("confidence")
    confidence = 0.0
    try:
        confidence = float(confidence_raw)
    except Exception:
        confidence = 0.0
    verdict = str(assessment.get("verdict") or "").strip()
    if verdict not in {"good_choice", "higher_impact", "depends"}:
        return None

    needs_clarification = bool(assessment.get("needs_clarification", False))
    suggested_query = assessment.get("suggested_query")
    clarification_question = assessment.get("clarification_question")
    if suggested_query is not None and not isinstance(suggested_query, str):
        suggested_query = None
    if clarification_question is not None and not isinstance(clarification_question, str):
        clarification_question = None

    summary = assessment.get("summary")
    portion_tip = assessment.get("portion_tip")
    if not isinstance(summary, str) or not summary.strip():
        return None
    if not needs_clarification and is_food_or_drink:
        if not isinstance(portion_tip, str) or not portion_tip.strip():
            portion_tip = "If you choose the original, start with a smaller portion and pair it with protein and non-starchy veggies."
    else:
        if not isinstance(portion_tip, str):
            portion_tip = ""
    watch_outs = _normalize_string_list(assessment.get("watch_outs"), limit=3)
    pair_with = _normalize_string_list(assessment.get("pair_with"), limit=3)

    # This endpoint is explicitly "Food swaps", so we don't rely on the model's should_show_swaps flag.
    # If the input is a food and doesn't need clarification, show swaps when we have enough candidates.
    should_show_bool = (not needs_clarification) and bool(is_food_or_drink)
    normalized_swaps = None
    if should_show_bool:
        candidates = _normalize_candidates(raw_candidates)
        # Don't hard-fail if the model output is a bit thin; fall back to assessment-only.
        if len(candidates) < 3:
            should_show_bool = False
            candidates = []
        best = _best_options_from_candidates(candidates, food_profile=food_profile)
        best = [c for c in best if isinstance(c, dict)]
        best = best[:5]
        opts = [str(c.get("name") or "").strip() for c in best]
        opts = [o for o in opts if o]
        if len(opts) < 3 or len(best) < 3:
            should_show_bool = False
            best = []
        why = swaps_explanation
        if not isinstance(why, str) or not why.strip():
            # Fallback: use the assessment summary if the model omitted swaps_explanation.
            why = assessment.get("summary")
        s_portion = assessment.get("portion_tip")
        if not isinstance(s_portion, str) or not s_portion.strip():
            return None
        if should_show_bool:
            normalized_swaps = {
                # Keep compatibility with older clients expecting a list of strings.
                "better_options": opts[:5],
                # Rich option details for improved UX.
                "options": [
                    {
                        "name": str(c.get("name") or "").strip()[:80],
                        "reason": str(c.get("reason") or "").strip()[:140],
                        "gi": c.get("gi"),
                        "serving": c.get("serving"),
                        "macros": c.get("macros"),
                        "impact_label": c.get("impact_label"),
                        "portion_suggestion": c.get("portion_suggestion"),
                        "fit_tags": c.get("fit_tags") or [],
                        "cuisine_fit": c.get("cuisine_fit") or [],
                    }
                    for c in best
                ],
                "why_these_are_better": str(why).strip()[:320],
                "portion_tip": s_portion.strip()[:240],
            }

    return {
        "assessment": {
            "is_food_or_drink": bool(is_food_or_drink),
            "confidence": max(0.0, min(1.0, confidence)),
            "verdict": verdict,
            "needs_clarification": bool(needs_clarification),
            "suggested_query": (_clean_food(suggested_query) if isinstance(suggested_query, str) else None),
            "clarification_question": (clarification_question.strip()[:140] if isinstance(clarification_question, str) else None),
            "summary": summary.strip()[:240],
            "watch_outs": watch_outs,
            "pair_with": pair_with,
            "portion_tip": (portion_tip.strip()[:240] if isinstance(portion_tip, str) else ""),
        },
        "should_show_swaps": should_show_bool,
        "swaps": normalized_swaps,
    }


class AISwapsService:
    def __init__(self) -> None:
        # Keep retries off for latency-sensitive endpoints (mobile requests may abort quickly).
        # The OpenAI SDK retries can extend total wall time far beyond our per-request timeout.
        self._openai = OpenAI(
            api_key=settings.openai_api_key,
            organization=settings.openai_organization,
            max_retries=0,
        )
        # Prefer a dedicated swaps model if configured; otherwise fall back to OPENAI_MODEL.
        swaps_model = (getattr(settings, "swaps_model", None) or "").strip()
        openai_model = (getattr(settings, "openai_model", None) or "").strip()
        self._model = swaps_model or openai_model or "gpt-4o-mini"

    def generate_swaps(
        self,
        *,
        food: str,
        force_swaps: bool = False,
        timeout_seconds: float = 12.0,
        food_profile: dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        food_clean = _clean_food(food)
        if not food_clean:
            raise ValueError("food is required")

        force_line = "User explicitly asked for substitutions: YES" if force_swaps else "User explicitly asked for substitutions: NO"
        profile_text = None
        try:
            from .food_profile_service import build_food_profile_instructions

            profile_text = build_food_profile_instructions(
                food_profile,
                strength="strong",
                mode="swaps",
                has_ingredients=False,
            )
        except Exception:
            profile_text = None
        user_prompt = f"""User food: {food_clean}
{force_line}
{(profile_text + chr(10)) if profile_text else ""}

Suggest 6 diabetes-friendly alternatives that may have lower blood sugar impact.
For each swap candidate, include:
- A GI range (gi_min/gi_max) ALWAYS. If unsure, estimate and set gi_note="Estimated".
- Estimated macros per a typical serving (serving + net_carbs_g + fiber_g + protein_g). Use nulls if unsure.
- A short portion_suggestion when the swap is still starchy (e.g. "keep to 1/2 cup cooked").
Do NOT include cooking instructions or times.
Write in very simple words (no jargon). Use short reasons (one sentence each).
Return ONLY the required JSON.
"""

        try:
            params: dict[str, Any] = {
                "model": self._model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.4,
                # Rich swap candidates (GI + macros) need more output room; keep bounded to control costs.
                "max_tokens": 900,
                # Prefer strict JSON mode where supported.
                "response_format": {"type": "json_object"},
            }
            resp = self._openai.chat.completions.create(**params, timeout=timeout_seconds)
        except OpenAIError as e:
            logger.warning("AI swaps OpenAI call failed: %s", str(e))
            raise

        content = (resp.choices[0].message.content or "").strip() if resp and resp.choices else ""
        data = _parse_json_object(content)
        if not data:
            raise ValueError("Unparseable AI swaps output")
        normalized = _normalize_payload(data, food_profile=food_profile)
        if not normalized:
            raise ValueError("Invalid AI swaps payload")
        return {
            "food": food_clean,
            "provider": "openai",
            "model": self._model,
            **normalized,
        }


def fallback_swaps(*, food: str, food_profile: dict[str, Any] | None, force_swaps: bool) -> Dict[str, Any]:
    key = _fallback_key(food)
    canonical = FALLBACK_ALIASES.get(key) or key
    data = FALLBACK_CATALOG.get(canonical)
    # If we have no fallback, return a minimal assessment that doesn't break clients.
    if not data:
        return {
            "food": _clean_food(food),
            "assessment": {
                "is_food_or_drink": True,
                "confidence": 0.7,
                "verdict": "depends",
                "needs_clarification": False,
                "suggested_query": None,
                "clarification_question": None,
                "summary": "AI is temporarily slow. Here are general lower-impact swap ideas you can use right now.",
                "watch_outs": [],
                "pair_with": [],
                "portion_tip": "Portion size and pairing matter.",
            },
            # Prefer showing something useful rather than a blank result when AI is down.
            "should_show_swaps": True,
            "swaps": {
                "better_options": [
                    "Non-starchy vegetables",
                    "Beans/lentils",
                    "Cauliflower rice / veg swaps",
                    "Greek yogurt / protein snack",
                    "Smaller portion + protein",
                ],
                "options": [
                    {
                        "name": "Non-starchy vegetables",
                        "reason": "Lower net carbs; adds fiber and volume.",
                        "gi": {"min": 0, "max": 30, "note": "Estimated"},
                        "serving": "1-2 cups",
                        "macros": None,
                        "impact_label": "low",
                        "portion_suggestion": "Aim for half your plate as vegetables.",
                        "fit_tags": ["balanced", "weight_loss", "budget_friendly"],
                        "cuisine_fit": ["generic"],
                    },
                    {
                        "name": "Beans/lentils",
                        "reason": "More fiber/protein; often steadier blood sugar response.",
                        "gi": {"min": 25, "max": 45, "note": "Estimated"},
                        "serving": "1/2 cup",
                        "macros": None,
                        "impact_label": "low",
                        "portion_suggestion": "Watch added sugar in canned/baked beans.",
                        "fit_tags": ["high_protein", "balanced", "budget_friendly"],
                        "cuisine_fit": ["generic"],
                    },
                    {
                        "name": "Cauliflower rice / veggie swaps",
                        "reason": "Cuts starch while keeping a similar 'base' texture.",
                        "gi": {"min": 0, "max": 25, "note": "Estimated"},
                        "serving": "1-2 cups",
                        "macros": None,
                        "impact_label": "low",
                        "portion_suggestion": "Pair with protein + healthy fat for satiety.",
                        "fit_tags": ["lower_carb", "quick_meals"],
                        "cuisine_fit": ["generic"],
                    },
                    {
                        "name": "Greek yogurt / protein snack",
                        "reason": "Higher protein; may reduce cravings for refined carbs.",
                        "gi": {"min": 10, "max": 35, "note": "Estimated"},
                        "serving": "3/4-1 cup",
                        "macros": None,
                        "impact_label": "low",
                        "portion_suggestion": "Choose plain/unsweetened; add berries if needed.",
                        "fit_tags": ["high_protein", "simple_ingredients"],
                        "cuisine_fit": ["generic"],
                    },
                    {
                        "name": "Smaller portion + protein",
                        "reason": "Portion control + pairing can reduce glucose spikes.",
                        "gi": {"min": 56, "max": 69, "note": "Estimated"},
                        "serving": "Reduce carbs by ~1/3",
                        "macros": None,
                        "impact_label": "medium",
                        "portion_suggestion": "Add eggs, chicken, fish, tofu, or beans.",
                        "fit_tags": ["balanced", "family_friendly"],
                        "cuisine_fit": ["generic"],
                    },
                ],
                "why_these_are_better": "They generally reduce net carbs and/or increase fiber and protein, which can blunt glucose spikes.",
                "portion_tip": "If you still choose the original food, start with a smaller portion and pair with protein + vegetables.",
            },
        }

    verdict = str(data.get("verdict") or "depends")
    if verdict not in {"good_choice", "higher_impact", "depends"}:
        verdict = "depends"
    candidates = list(data.get("candidates") or [])
    best = _best_options_from_candidates(candidates, food_profile=food_profile)
    best = [c for c in best if isinstance(c, dict)][:5]
    opts = [str(c.get("name") or "").strip() for c in best if str(c.get("name") or "").strip()]

    should_show = bool(force_swaps) or (verdict != "good_choice")
    swaps_payload = None
    if should_show and len(opts) < 3:
        # If preference filtering makes the list too short, fall back to the raw catalog
        # so the UI always has swap options to show.
        raw_names = [str(c.get("name") or "").strip() for c in candidates if isinstance(c, dict)]
        raw_names = [n for n in raw_names if n]
        if len(raw_names) >= 3:
            opts = raw_names[:5]
            best = [c for c in candidates if isinstance(c, dict)][:5]

    if should_show and len(opts) >= 3:
        swaps_payload = {
            "better_options": opts[:5],
            "options": [
                {
                    "name": str(c.get("name") or "").strip()[:80],
                    "reason": str(c.get("reason") or "").strip()[:140],
                    "gi": c.get("gi"),
                    "serving": c.get("serving"),
                    "macros": c.get("macros"),
                    "impact_label": c.get("impact_label"),
                    "portion_suggestion": c.get("portion_suggestion"),
                    "fit_tags": c.get("fit_tags") or [],
                    "cuisine_fit": c.get("cuisine_fit") or [],
                }
                for c in best
            ],
            "why_these_are_better": str(data.get("why") or "").strip()[:320] or "These options may reduce net carbs or increase fiber/protein.",
            "portion_tip": str(data.get("portion_tip") or "").strip()[:240] or "Portion size and pairing matter.",
        }

    summary = str(data.get("summary") or "").strip()[:240] or "Portion size and pairing matter."
    portion_tip = str(data.get("portion_tip") or "").strip()[:240] or "Portion size and pairing matter."
    return {
        "food": _clean_food(food),
        "assessment": {
            "is_food_or_drink": True,
            "confidence": 0.75,
            "verdict": verdict,
            "needs_clarification": False,
            "suggested_query": None,
            "clarification_question": None,
            "summary": summary,
            "watch_outs": [],
            "pair_with": [],
            "portion_tip": portion_tip,
        },
        "should_show_swaps": bool(swaps_payload),
        "swaps": swaps_payload,
    }


def has_fallback_swaps(food: str) -> bool:
    key = _fallback_key(food)
    canonical = FALLBACK_ALIASES.get(key) or key
    return bool(canonical) and canonical in FALLBACK_CATALOG
