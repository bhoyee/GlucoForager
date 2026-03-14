from __future__ import annotations

from typing import Any, Literal

from ..models.user import User


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
        lines.append(f"- Blood sugar profile: {bsp.strip()}")

    goals = profile.get("meal_goals") or []
    if isinstance(goals, list) and goals:
        lines.append(f"- Goals: {', '.join(goals[:4])}")

    diet = profile.get("dietary_pattern")
    if isinstance(diet, str) and diet.strip() and diet.strip().lower() not in {"none", "no preference"}:
        lines.append(f"- Dietary pattern: {diet.strip()}")

    cuisines = profile.get("preferred_cuisines") or []
    if isinstance(cuisines, list) and cuisines:
        lines.append(f"- Preferred cuisines: {', '.join(cuisines[:3])}")

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
        lines.append(f"- Cooking time preference: {cook_time.strip()}")

    country_code = profile.get("country_code")
    if isinstance(country_code, str) and country_code.strip():
        lines.append(f"- Country: {country_code.strip().upper()}")

    if strength == "soft" and has_ingredients:
        lines.append(
            "Use preferences as tie-breakers. Do not ignore provided ingredients; "
            "instead adapt style/seasoning and choose recipes that fit the user's constraints."
        )
    else:
        # Surprise/quick modes have no ingredients and should follow the profile strongly.
        if mode in ("surprise", "quick"):
            lines.append("Prioritize these preferences strongly for all recipes.")
        else:
            lines.append("Prioritize these preferences when possible, while still respecting provided ingredients.")

    # Keep compact.
    return "\n".join(lines).strip()
