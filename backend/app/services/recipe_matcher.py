from collections.abc import Iterable
from typing import Any

from ..core.constants import DEFAULT_DIABETES_TAG, MATCH_THRESHOLD
from ..models.recipe import Recipe


def _normalize(items: Iterable[str]) -> set[str]:
    return {item.strip().lower() for item in items if item}


def calculate_ingredient_match(user_ingredients: list[str], recipe_ingredients: list[dict[str, Any]]) -> float:
    user_set = _normalize(user_ingredients)
    recipe_set = _normalize([ingredient.get("name", "") for ingredient in recipe_ingredients])
    if not recipe_set:
        return 0.0
    return len(user_set & recipe_set) / len(recipe_set)


def find_missing_items(user_ingredients: list[str], recipe_ingredients: list[dict[str, Any]]) -> list[str]:
    user_set = _normalize(user_ingredients)
    missing = []
    for ingredient in recipe_ingredients:
        name = ingredient.get("name", "").strip().lower()
        if name and name not in user_set:
            missing.append(name)
    return missing


def find_diabetes_recipes(user_ingredients: list[str], recipes: list[Recipe], max_results: int = 3):
    diabetic_recipes = [recipe for recipe in recipes if DEFAULT_DIABETES_TAG in (recipe.tags or [])]
    scored_recipes = []
    for recipe in diabetic_recipes:
        match_score = calculate_ingredient_match(user_ingredients, recipe.ingredients or [])
        if match_score > MATCH_THRESHOLD:
            scored_recipes.append(
                {
                    "recipe": recipe,
                    "match_score": match_score,
                    "missing_ingredients": find_missing_items(user_ingredients, recipe.ingredients or []),
                }
            )

    scored_recipes.sort(
        key=lambda x: (-x["match_score"], x["recipe"].glycemic_index or 0, x["recipe"].total_time)
    )
    return scored_recipes[:max_results]
