from __future__ import annotations

from typing import Any, Literal

from ..models.user import User


_BLOOD_SUGAR_LABELS: dict[str, str] = {
    "type_2": "Type 2 diabetes",
    "prediabetes": "Prediabetes",
    "type_1": "Type 1 diabetes",
    "gestational": "Gestational diabetes",
    "managing": "Managing blood sugar",
    "prefer_not": "Prefer not to say",
}

_GOAL_LABELS: dict[str, str] = {
    "lower_carb": "Lower carb",
    "high_protein": "High protein",
    "balanced": "Balanced",
    "weight_loss": "Weight loss friendly",
    "quick_meals": "Quick meals",
    "simple_ingredients": "Simple ingredients",
    "budget_friendly": "Budget friendly",
    "family_friendly": "Family friendly",
}

_DIET_LABELS: dict[str, str] = {
    "none": "None / No preference",
    "vegetarian": "Vegetarian",
    "vegan": "Vegan",
    "pescatarian": "Pescatarian",
    "halal": "Halal",
    "kosher": "Kosher",
    "other": "Other",
}

_CUISINE_LABELS: dict[str, str] = {
    "west_african": "West African",
    "east_african": "East African",
    "mena": "North African / Middle Eastern",
    "british_irish": "British / Irish",
    "american_canadian": "American / Canadian",
    "caribbean": "Caribbean",
    "mediterranean": "Mediterranean",
    "south_asian": "South Asian",
    "east_asian": "East Asian",
    "southeast_asian": "Southeast Asian",
    "latin_american": "Latin American",
    "european": "European",
    "other": "Other",
}

_COOK_TIME_LABELS: dict[str, str] = {
    "under_15": "Under 15 minutes",
    "15_30": "15-30 minutes",
    "30_45": "30-45 minutes",
    "any": "Any time",
}

# Keep this short; it's only used to make prompts more explicit when a country is selected.
_COUNTRY_LABELS: dict[str, str] = {
    "NG": "Nigeria",
    "GH": "Ghana",
    "KE": "Kenya",
    "ZA": "South Africa",
    "GB": "United Kingdom",
    "US": "United States",
    "CA": "Canada",
    "IE": "Ireland",
    "IN": "India",
    "PK": "Pakistan",
    "BD": "Bangladesh",
    "PH": "Philippines",
    "TH": "Thailand",
    "VN": "Vietnam",
    "MX": "Mexico",
    "BR": "Brazil",
}


def _humanize(value: Any, mapping: dict[str, str]) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    key = cleaned.lower()
    return mapping.get(key) or mapping.get(cleaned)  # allow already-normalized keys


def _humanize_list(values: Any, mapping: dict[str, str], *, max_items: int) -> list[str]:
    if not isinstance(values, list):
        return []
    out: list[str] = []
    for item in values:
        label = _humanize(item, mapping)
        if label:
            out.append(label)
        elif isinstance(item, str) and item.strip():
            out.append(item.strip().replace("_", " "))
        if len(out) >= max_items:
            break
    return out


def extract_food_profile(user: User) -> dict[str, Any]:
    """Extract only the preference fields used for personalization.

    Keep this stable and compact so it can safely be used in cache keys.
    """

    def _list(value: Any, *, max_items: int = 24) -> list[str]:
        if not isinstance(value, list):
            return []
        out: list[str] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, str):
                continue
            cleaned = item.strip()
            if not cleaned:
                continue
            key = cleaned.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(cleaned)
            if len(out) >= max_items:
                break
        return out

    return {
        "blood_sugar_profile": (getattr(user, "blood_sugar_profile", None) or None),
        "country_code": (getattr(user, "country_code", None) or None),
        "preferred_cuisines": _list(getattr(user, "preferred_cuisines", None), max_items=6),
        "meal_goals": _list(getattr(user, "meal_goals", None), max_items=4),
        "dietary_pattern": (getattr(user, "dietary_pattern", None) or None),
        "allergens": _list(getattr(user, "allergens", None), max_items=24),
        "food_exclusions": _list(getattr(user, "food_exclusions", None), max_items=24),
        "available_equipment": _list(getattr(user, "available_equipment", None), max_items=12),
        "cook_time_preference": (getattr(user, "cook_time_preference", None) or None),
        "profile_completed": bool(getattr(user, "profile_completed", False)),
    }


def build_food_profile_instructions(
    profile: dict[str, Any] | None,
    *,
    strength: Literal["soft", "strong"],
    mode: str,
    has_ingredients: bool,
) -> str | None:
    """Build short, safe prompt instructions from profile.

    - soft: use as tie-breaker / preference
    - strong: prioritize preferences when possible
    """
    if not profile or not isinstance(profile, dict):
        return None

    meaningful = any(
        profile.get(k)
        for k in (
            "blood_sugar_profile",
            "country_code",
            "preferred_cuisines",
            "meal_goals",
            "dietary_pattern",
            "allergens",
            "food_exclusions",
            "available_equipment",
            "cook_time_preference",
        )
    )
    # If the user skipped onboarding and left everything empty, do not add any prompt noise.
    if not meaningful:
        return None

    lines: list[str] = []
    lines.append("User preferences (follow these):")

    bsp = profile.get("blood_sugar_profile")
    if isinstance(bsp, str) and bsp.strip():
        lines.append(f"- Blood sugar profile: {_BLOOD_SUGAR_LABELS.get(bsp.strip(), bsp.strip())}")

    goals = _humanize_list(profile.get("meal_goals") or [], _GOAL_LABELS, max_items=4)
    if goals:
        lines.append(f"- Goals: {', '.join(goals)}")

    diet = profile.get("dietary_pattern")
    if isinstance(diet, str) and diet.strip() and diet.strip().lower() not in {"none", "no preference"}:
        lines.append(f"- Dietary pattern: {_DIET_LABELS.get(diet.strip(), diet.strip())}")

    cuisine_labels = _humanize_list(profile.get("preferred_cuisines") or [], _CUISINE_LABELS, max_items=3)
    if cuisine_labels:
        lines.append(f"- Preferred cuisines: {', '.join(cuisine_labels)}")

    avoid_allergens = profile.get("allergens") or []
    if isinstance(avoid_allergens, list) and avoid_allergens:
        lines.append(f"- Allergies/intolerances to avoid: {', '.join(avoid_allergens[:12])}")

    avoid_foods = profile.get("food_exclusions") or []
    if isinstance(avoid_foods, list) and avoid_foods:
        lines.append(f"- Foods to avoid: {', '.join(avoid_foods[:12])}")

    equipment = profile.get("available_equipment") or []
    if isinstance(equipment, list) and equipment:
        lines.append(f"- Available equipment: {', '.join(equipment[:6])}")

    cook_time = profile.get("cook_time_preference")
    if isinstance(cook_time, str) and cook_time.strip() and cook_time.strip().lower() != "any":
        lines.append(f"- Cooking time preference: {_COOK_TIME_LABELS.get(cook_time.strip(), cook_time.strip())}")

    country_code = profile.get("country_code")
    if isinstance(country_code, str) and country_code.strip():
        cc = country_code.strip().upper()
        country_name = _COUNTRY_LABELS.get(cc)
        if country_name:
            lines.append(f"- Country: {country_name} ({cc})")
        else:
            lines.append(f"- Country: {cc}")

    # Add one explicit nudge for regional/cuisine focus in text-only modes.
    if mode in ("surprise", "quick", "swaps") and cuisine_labels:
        if "West African" in cuisine_labels and (country_code or "").strip().upper() == "NG":
            lines.append("- Regional focus: Nigerian-style West African meals when possible.")
        else:
            lines.append(f"- Regional focus: {', '.join(cuisine_labels)} style when possible.")

    if strength == "soft" and has_ingredients:
        lines.append(
            "Use preferences as tie-breakers. Do not ignore provided ingredients; "
            "instead adapt style/seasoning and choose recipes that fit the user's constraints."
        )
    else:
        # Surprise/quick/swaps modes have no ingredients and should follow the profile strongly.
        if mode in ("surprise", "quick", "swaps"):
            if mode == "swaps":
                lines.append("Prioritize these preferences strongly for swaps.")
            else:
                lines.append("Prioritize these preferences strongly for all recipes.")
        else:
            lines.append("Prioritize these preferences when possible, while still respecting provided ingredients.")

    # Keep compact.
    return "\n".join(lines).strip()
