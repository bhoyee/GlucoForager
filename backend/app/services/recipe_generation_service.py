from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import Session

from ..models.recipe import Recipe
from .ai_recipe_generator import AIRecipeGenerator


class RecipeGenerationError(Exception):
    pass


@dataclass
class RecipeGenerationParams:
    count: int = 10
    meal_type: str | None = None
    cuisine_tags: list[str] = field(default_factory=list)
    dietary_tags: list[str] = field(default_factory=list)
    goal_tags: list[str] = field(default_factory=list)
    diabetes_type_tags: list[str] = field(default_factory=list)
    equipment_tags: list[str] = field(default_factory=list)
    cook_time_tag: str | None = None
    notes: str | None = None


def _recipe_nutrition_safety_flags(meal_type: str | None, nutrition: dict | None) -> list[dict]:
    if not isinstance(nutrition, dict):
        return [{"code": "nutrition_missing", "level": "warning", "message": "Nutrition values are missing. Review before publishing."}]

    def _num(key: str) -> float:
        try:
            return float(nutrition.get(key) or 0)
        except Exception:
            return 0.0

    meal = str(meal_type or "").strip().lower()
    sugar = _num("sugar")
    carbs = _num("carbs")
    protein = _num("protein")
    fiber = _num("fiber")
    flags: list[dict] = []

    sugar_limit = 10.0 if meal in {"breakfast", "snack"} else 8.0
    carb_limit = 30.0 if meal in {"breakfast", "snack"} else 35.0
    protein_target = 10.0 if meal in {"breakfast", "snack"} else 15.0
    fiber_target = 4.0 if meal in {"breakfast", "snack"} else 5.0

    if sugar > 25:
        flags.append(
            {
                "code": "danger_high_sugar",
                "level": "danger",
                "message": f"Sugar is {sugar:g}g per serving. This is too high for a diabetes-friendly recipe.",
            }
        )
    elif sugar > sugar_limit:
        flags.append(
            {
                "code": "high_sugar",
                "level": "warning",
                "message": f"Sugar is {sugar:g}g per serving. Target is {sugar_limit:g}g or less for this meal type.",
            }
        )

    if carbs > 60:
        flags.append(
            {
                "code": "danger_high_carbs",
                "level": "danger",
                "message": f"Carbs are {carbs:g}g per serving. Review or lower the carbohydrate load before publishing.",
            }
        )
    elif carbs > carb_limit:
        flags.append(
            {
                "code": "high_carbs",
                "level": "warning",
                "message": f"Carbs are {carbs:g}g per serving. Target is about {carb_limit:g}g or less where realistic.",
            }
        )

    if protein and protein < protein_target:
        flags.append(
            {
                "code": "low_protein",
                "level": "warning",
                "message": f"Protein is {protein:g}g per serving. Consider increasing protein for better satiety and glucose response.",
            }
        )

    if fiber and fiber < fiber_target:
        flags.append(
            {
                "code": "low_fiber",
                "level": "warning",
                "message": f"Fiber is {fiber:g}g per serving. Consider adding more fiber-rich ingredients.",
            }
        )

    return flags


def _has_blocking_recipe_safety_flag(flags: list[dict] | None) -> bool:
    return any(str(item.get("level") or "").lower() == "danger" for item in flags or [] if isinstance(item, dict))


def _normalize_recipe_title(title: str) -> str:
    text = re.sub(r"[^a-z0-9]+", " ", str(title or "").lower())
    return re.sub(r"\s+", " ", text).strip()


def _existing_recipe_title_set(db: Session) -> set[str]:
    rows = db.query(Recipe.name).all()
    return {_normalize_recipe_title(row[0]) for row in rows if row and row[0]}


def _clean_ai_tag_list(value, *, allowed: set[str] | None = None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    raw = value if isinstance(value, list) else []
    for item in raw:
        tag = str(item or "").strip().lower()
        if not tag or tag in seen:
            continue
        if allowed and tag not in allowed:
            continue
        out.append(tag)
        seen.add(tag)
    return out


def _coerce_number(value, default=0):
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return value
    match = re.search(r"-?\d+(?:\.\d+)?", str(value))
    if not match:
        return default
    try:
        number = float(match.group(0))
        return int(number) if number.is_integer() else number
    except Exception:
        return default


def _coerce_ingredients(value) -> list[dict]:
    if not isinstance(value, list):
        return []
    out: list[dict] = []
    for item in value:
        if isinstance(item, str):
            name = item.strip()
            if name:
                out.append({"name": name, "quantity": "", "unit": "", "note": ""})
            continue
        if isinstance(item, dict):
            name = str(item.get("name") or item.get("ingredient") or "").strip()
            if not name:
                continue
            out.append(
                {
                    "name": name,
                    "quantity": str(item.get("quantity") or "").strip(),
                    "unit": str(item.get("unit") or "").strip(),
                    "note": str(item.get("note") or "").strip(),
                }
            )
    return out


def _coerce_steps(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item or "").strip()]
    if isinstance(value, str):
        return [line.strip() for line in value.split("\n") if line.strip()]
    return []


def _escape_newlines_in_json_strings(text: str) -> str:
    out: list[str] = []
    in_string = False
    escape = False
    for ch in text:
        if in_string:
            if escape:
                escape = False
                out.append(ch)
                continue
            if ch == "\\":
                escape = True
                out.append(ch)
                continue
            if ch == "\"":
                in_string = False
                out.append(ch)
                continue
            if ch == "\n":
                out.append("\\n")
                continue
            if ch == "\r":
                out.append("\\r")
                continue
            out.append(ch)
            continue
        if ch == "\"":
            in_string = True
        out.append(ch)
    return "".join(out)


def _json_loads_with_repair(text: str):
    try:
        return json.loads(text)
    except Exception:
        return json.loads(_escape_newlines_in_json_strings(text))


def _extract_json_object(raw: str):
    text = str(raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*", "", text).strip("`").strip()
    try:
        return _json_loads_with_repair(text)
    except Exception:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return _json_loads_with_repair(text[start : end + 1])
    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        return _json_loads_with_repair(text[start : end + 1])
    raise ValueError("AI response did not contain valid JSON")


def _repair_recipe_json_with_ai(
    *,
    generator: AIRecipeGenerator,
    providers: list[tuple[str, object, str | None]],
    raw: str,
    parse_error: Exception,
    expected_count: int,
    attempts: list[str],
):
    repair_prompt = (
        "Repair the following invalid JSON into one valid minified JSON object only. "
        "Do not add markdown or explanations. Preserve the same recipe data where possible. "
        "The output must be exactly {\"recipes\":[...]} and must contain no trailing commas, "
        "no comments, and all quote marks inside strings must be escaped. "
        f"Expected recipe count: {expected_count}. "
        f"Parser error: {str(parse_error)[:300]}\n\n"
        f"Invalid JSON:\n{str(raw or '')[:70000]}"
    )
    for provider, client, model in providers:
        if not model:
            continue
        try:
            repaired = generator._call(
                client,
                model,
                [],
                [],
                prompt_template=repair_prompt,
                temperature=0.0,
                timeout_seconds=60.0,
                max_output_tokens=min(12000, max(3000, expected_count * 900)),
            )
            if repaired:
                return _extract_json_object(repaired)
        except Exception as exc:  # noqa: BLE001
            attempts.append(f"repair:{provider}:{model}:{str(exc)[:160]}")
    raise parse_error


def _admin_recipe_ai_prompt(params: RecipeGenerationParams, existing_titles: list[str]) -> str:
    allowed = {
        "meal_types": ["breakfast", "lunch", "dinner", "snack"],
        "cuisine_tags": ["west_african", "east_african", "mena", "british_irish", "american_canadian", "caribbean", "mediterranean", "south_asian", "east_asian", "southeast_asian", "latin_american", "european", "other"],
        "dietary_tags": ["vegetarian", "vegan", "pescatarian", "halal", "kosher"],
        "allergen_tags": ["dairy", "eggs", "fish", "shellfish", "peanuts", "tree_nuts", "soy", "wheat_gluten", "sesame"],
        "food_exclusion_tags": ["pork", "beef", "chicken", "seafood", "onion_garlic", "spicy_food", "mushrooms", "alcohol", "caffeine"],
        "goal_tags": ["lower_carb", "high_protein", "quick_meals", "simple_ingredients", "weight_loss", "balanced"],
        "equipment_tags": ["air_fryer", "blender", "microwave", "oven", "stovetop", "grill", "slow_cooker"],
        "diabetes_type_tags": ["type_1", "type_2", "prediabetes", "gestational"],
        "cook_time_tags": ["under_15", "15_30", "30_45", "45_plus"],
    }
    constraints = {
        "count": params.count,
        "meal_type": params.meal_type,
        "cuisine_tags": params.cuisine_tags,
        "dietary_tags": params.dietary_tags,
        "goal_tags": params.goal_tags,
        "diabetes_type_tags": params.diabetes_type_tags,
        "equipment_tags": params.equipment_tags,
        "cook_time_tag": params.cook_time_tag,
        "notes": params.notes,
        "existing_titles_to_avoid": existing_titles[:80],
    }
    return (
        "Generate production-ready diabetes-friendly recipes for the GlucoForager admin recipe library. "
        "Return ONLY valid minified JSON with shape {\"recipes\":[...]}. "
        "Do not use markdown. Do not add comments. Do not use trailing commas. Escape all quote marks inside strings. "
        "Each recipe must fit this schema: name, meal_type, description, prep_time_minutes, cook_time_minutes, servings, "
        "image_prompt, ingredients[{name,quantity,unit,note}], instructions[], nutrition{calories,carbs,protein,fat,fiber,sugar}, "
        "cuisine_tags[], dietary_tags[], allergen_tags[], food_exclusion_tags[], goal_tags[], equipment_tags[], "
        "diabetes_type_tags[], cook_time_tag. "
        "Keep description, image_prompt, and each instruction concise. "
        "Recipe names must sound natural and appetizing, like something on a real menu. Do not mechanically "
        "prefix or relabel a generic dish with the requested cuisine name (avoid names like 'East African "
        "Chickpea Hummus' when the dish itself isn't actually a regional one - hummus is Levantine, not East "
        "African, for example). Only put a region/cuisine word in the title when it's part of an actual named "
        "dish (e.g. 'Jollof Rice', 'Injera'). Reflect the requested cuisine_tags through authentic regional "
        "ingredients, spices, and technique in the recipe itself, not by relabeling the title. "
        "Use only the allowed metadata values. Do not include pork or alcohol. Hard nutrition targets per serving: "
        "sugar <=10g for breakfast/snack, <=8g for lunch/dinner; carbs <=30g for breakfast/snack, <=35g for lunch/dinner; "
        "protein should be 20g+ for lunch/dinner where possible; fiber should be 5g+ where possible. "
        "Avoid duplicate or very similar titles from existing_titles_to_avoid. "
        f"Allowed metadata: {json.dumps(allowed)}. "
        f"Generation constraints: {json.dumps(constraints)}."
    )


def _normalize_ai_recipe_draft(item: dict) -> dict | None:
    if not isinstance(item, dict):
        return None
    allowed_cook = {"under_15", "15_30", "30_45", "45_plus"}
    name = str(item.get("name") or item.get("title") or "").strip()
    meal_type = str(item.get("meal_type") or "").strip().lower()
    if meal_type not in {"breakfast", "lunch", "dinner", "snack"}:
        meal_type = "dinner"
    ingredients = _coerce_ingredients(item.get("ingredients"))
    instructions = _coerce_steps(item.get("instructions") or item.get("steps"))
    if not name or not ingredients or not instructions:
        return None
    nutrition_src = item.get("nutrition") or item.get("nutrition_per_serving") or item.get("nutritional_info") or {}
    nutrition = {
        "calories": _coerce_number(nutrition_src.get("calories"), 0),
        "carbs": _coerce_number(nutrition_src.get("carbs"), 0),
        "protein": _coerce_number(nutrition_src.get("protein"), 0),
        "fat": _coerce_number(nutrition_src.get("fat"), 0),
        "fiber": _coerce_number(nutrition_src.get("fiber"), 0),
        "sugar": _coerce_number(nutrition_src.get("sugar"), 0),
    }
    cook_time_tag = str(item.get("cook_time_tag") or "").strip().lower()
    if cook_time_tag not in allowed_cook:
        cook_time_tag = None
    return {
        "name": name[:120],
        "meal_type": meal_type,
        "description": str(item.get("description") or "").strip()[:500] or "Diabetes-friendly recipe draft.",
        "prep_time_minutes": int(_coerce_number(item.get("prep_time_minutes"), 0) or 0),
        "cook_time_minutes": int(_coerce_number(item.get("cook_time_minutes"), 0) or 0),
        "servings": int(_coerce_number(item.get("servings"), 2) or 2),
        "image_prompt": str(item.get("image_prompt") or "").strip()[:500],
        "ingredients": ingredients,
        "instructions": instructions,
        "nutrition": nutrition,
        "cuisine_tags": _clean_ai_tag_list(item.get("cuisine_tags")),
        "dietary_tags": _clean_ai_tag_list(item.get("dietary_tags")),
        "allergen_tags": _clean_ai_tag_list(item.get("allergen_tags")),
        "food_exclusion_tags": _clean_ai_tag_list(item.get("food_exclusion_tags")),
        "goal_tags": _clean_ai_tag_list(item.get("goal_tags")),
        "equipment_tags": _clean_ai_tag_list(item.get("equipment_tags")),
        "diabetes_type_tags": _clean_ai_tag_list(item.get("diabetes_type_tags")),
        "cook_time_tag": cook_time_tag,
    }


def generate_recipe_draft_batch(
    db: Session,
    params: RecipeGenerationParams,
    *,
    generated_by_admin_user_id: int | None,
) -> dict:
    """Core AI recipe-draft generation, shared by the manual admin endpoint and the
    scheduled auto-generation job so both paths run the exact same logic."""
    generator = AIRecipeGenerator()
    if not generator.enabled:
        raise RecipeGenerationError("AI recipe generation is not configured.")

    existing_norm = _existing_recipe_title_set(db)
    existing_titles = [row[0] for row in db.query(Recipe.name).order_by(Recipe.created_at.desc()).limit(120).all() if row and row[0]]
    prompt = _admin_recipe_ai_prompt(params, existing_titles)

    attempts: list[str] = []
    raw = ""
    providers = []
    if generator.primary_client:
        providers.append(("openai", generator.primary_client, generator.primary_model))
    if generator.fallback_client:
        providers.append(("fallback", generator.fallback_client, generator.fallback_model))

    for provider, client, model in providers:
        if not model:
            continue
        try:
            raw = generator._call(  # Reuse the same configured provider/model path as the app recipe generator.
                client,
                model,
                [],
                [],
                prompt_template=prompt,
                temperature=0.45,
                timeout_seconds=75.0,
                max_output_tokens=min(12000, max(3000, params.count * 1000)),
            )
            if raw:
                break
        except Exception as exc:  # noqa: BLE001
            attempts.append(f"{provider}:{model}:{str(exc)[:160]}")

    if not raw:
        raise RecipeGenerationError("AI did not return recipe drafts.")

    try:
        data = _extract_json_object(raw)
    except Exception as exc:
        try:
            data = _repair_recipe_json_with_ai(
                generator=generator,
                providers=providers,
                raw=raw,
                parse_error=exc,
                expected_count=params.count,
                attempts=attempts,
            )
        except Exception as repair_exc:
            raise RecipeGenerationError(
                f"AI returned invalid recipe JSON after repair attempt: {str(repair_exc)[:160]}"
            ) from repair_exc

    raw_recipes = data.get("recipes") if isinstance(data, dict) else data
    if not isinstance(raw_recipes, list):
        raise RecipeGenerationError("AI response did not include a recipes list.")

    created: list[dict] = []
    skipped_duplicates: list[str] = []
    skipped_invalid = 0
    now = datetime.utcnow()
    for item in raw_recipes:
        draft = _normalize_ai_recipe_draft(item)
        if not draft:
            skipped_invalid += 1
            continue
        title_norm = _normalize_recipe_title(draft["name"])
        if not title_norm or title_norm in existing_norm:
            skipped_duplicates.append(draft["name"])
            continue
        safety_flags = _recipe_nutrition_safety_flags(draft["meal_type"], draft["nutrition"])
        recipe = Recipe(
            name=draft["name"],
            meal_type=draft["meal_type"],
            description=draft["description"],
            prep_time_minutes=draft["prep_time_minutes"],
            cook_time_minutes=draft["cook_time_minutes"],
            servings=draft["servings"],
            image_url=None,
            image_prompt=draft["image_prompt"] or None,
            ingredients=draft["ingredients"],
            instructions=draft["instructions"],
            nutrition=draft["nutrition"],
            cuisine_tags=draft["cuisine_tags"],
            dietary_tags=draft["dietary_tags"],
            allergen_tags=draft["allergen_tags"],
            food_exclusion_tags=draft["food_exclusion_tags"],
            goal_tags=draft["goal_tags"],
            equipment_tags=draft["equipment_tags"],
            diabetes_type_tags=draft["diabetes_type_tags"],
            cook_time_tag=draft["cook_time_tag"],
            safety_flags=safety_flags,
            status="draft",
            source="ai_generated",
            generated_by_admin_user_id=generated_by_admin_user_id,
            created_at=now,
            updated_at=now,
        )
        db.add(recipe)
        db.flush()
        existing_norm.add(title_norm)
        created.append({"id": recipe.id, "name": recipe.name, "meal_type": recipe.meal_type, "safety_flags": safety_flags})
        if len(created) >= params.count:
            break

    db.commit()
    return {
        "created": created,
        "created_count": len(created),
        "skipped_duplicates": skipped_duplicates,
        "skipped_invalid": skipped_invalid,
        "attempts": attempts,
    }
