from typing import Any, Dict, List
import time

from sqlalchemy.orm import Session

from ..services.tiered_ai_service import TieredAIService
from ..models.recipe_history import RecipeHistory
from .diabetes_friendly_classifier import DiabetesFriendlyClassifier
from .ingredient_classifier import IngredientClassifier
from .cost_tracker import record_ai_request


class IngredientValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class AIPipeline:
    """End-to-end AI pipeline: vision -> recipes, with usage tracking."""

    def __init__(self) -> None:
        self.ai = TieredAIService()
        self.classifier = DiabetesFriendlyClassifier()
        self.ingredient_classifier = IngredientClassifier()

    def _validate_ingredients(self, ingredients: list[str]) -> None:
        if not ingredients:
            raise IngredientValidationError("not_food", "Image not related to food.")

    def _clean_ingredients(self, ingredients: list[str]) -> list[str]:
        cleaned: list[str] = []
        for item in ingredients:
            if not item:
                continue
            stripped = item.strip()
            if not stripped:
                continue
            stripped = stripped.strip("\"'").strip()
            if not stripped:
                continue
            cleaned.append(stripped)
        return cleaned

    def _get_diabetes_warning(self, ingredients: list[str]) -> dict | None:
        verdict = self.classifier.classify(ingredients)
        if not verdict.get("diabetes_friendly"):
            return {
                "code": "not_diabetes_friendly",
                "message": verdict.get("reason") or "Ingredients may not be diabetes-friendly.",
                "risk_level": verdict.get("risk_level", "moderate"),
                "source": verdict.get("source", "rules"),
            }
        return None

    def fridge_to_recipes(
        self,
        db: Session,
        user_id: int,
        tier: str,
        image_base64: str,
        filters: list[str] | None = None,
        device_id: str | None = None,
    ) -> Dict[str, Any]:
        analysis = self.ai.analyze_vision(image_base64, tier)
        ingredients = self._clean_ingredients(analysis.get("ingredients", []))
        self._validate_ingredients(ingredients)
        classified = self.ingredient_classifier.classify(ingredients)
        food_only = classified.get("food", [])
        non_food = classified.get("non_food", [])
        self._validate_ingredients(food_only)
        warning = self._get_diabetes_warning(food_only)
        if non_food and not warning:
            warning = {
                "code": "non_food_ignored",
                "message": "Some items were not food ingredients and were ignored.",
                "risk_level": "low",
                "source": classified.get("source", "rules"),
            }
        recipes = self.ai.generate_recipes(
            food_only,
            tier,
            filters=filters,
            timeout_seconds=55,
            generate_images=False,
        )
        recipes = self._validated_recipes_or_none(recipes)
        if recipes is None:
            recipes_retry = self.ai.generate_recipes(
                food_only,
                tier,
                filters=filters,
                variety_mode=True,
                timeout_seconds=55,
                generate_images=False,
            )
            recipes = self._validated_recipes_or_none(recipes_retry)
        if recipes is None:
            raise RuntimeError("Recipe generation failed. Please try again.")
        record_ai_request(db, user_id, tier, "vision", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        record_ai_request(db, user_id, tier, "recipes", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        db.add(RecipeHistory(user_id=user_id, source="vision", recipes=recipes))
        db.commit()
        return {
            "recipes": recipes,
            "detected": food_only,
            "non_food": non_food,
            "filters": filters or [],
            "warning": warning,
        }

    def fridge_to_recipes_batch(
        self,
        db: Session,
        user_id: int,
        tier: str,
        images_base64: list[str],
        filters: list[str] | None = None,
        device_id: str | None = None,
    ) -> Dict[str, Any]:
        all_ingredients: list[str] = []
        for image in images_base64:
            analysis = self.ai.analyze_vision(image, tier)
            detected = analysis.get("ingredients", [])
            all_ingredients.extend(detected)

        # De-duplicate while preserving order
        seen = set()
        unique = []
        for item in all_ingredients:
            key = item.lower()
            if key in seen:
                continue
            seen.add(key)
            unique.append(item)

        unique = self._clean_ingredients(unique)
        self._validate_ingredients(unique)
        classified = self.ingredient_classifier.classify(unique)
        food_only = classified.get("food", [])
        non_food = classified.get("non_food", [])
        self._validate_ingredients(food_only)
        warning = self._get_diabetes_warning(food_only)
        if non_food and not warning:
            warning = {
                "code": "non_food_ignored",
                "message": "Some items were not food ingredients and were ignored.",
                "risk_level": "low",
                "source": classified.get("source", "rules"),
            }
        recipes = self.ai.generate_recipes(
            food_only,
            tier,
            filters=filters,
            timeout_seconds=55,
            generate_images=False,
        )
        recipes = self._validated_recipes_or_none(recipes)
        if recipes is None:
            recipes_retry = self.ai.generate_recipes(
                food_only,
                tier,
                filters=filters,
                variety_mode=True,
                timeout_seconds=55,
                generate_images=False,
            )
            recipes = self._validated_recipes_or_none(recipes_retry)
        if recipes is None:
            raise RuntimeError("Recipe generation failed. Please try again.")
        record_ai_request(db, user_id, tier, "vision_batch", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        record_ai_request(db, user_id, tier, "recipes", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        db.add(RecipeHistory(user_id=user_id, source="vision", recipes=recipes))
        db.commit()
        return {
            "recipes": recipes,
            "detected": food_only,
            "non_food": non_food,
            "filters": filters or [],
            "warning": warning,
        }
    def text_to_recipes(
        self,
        db: Session,
        user_id: int,
        tier: str,
        ingredients: List[str],
        filters: list[str] | None = None,
        exclude_titles: list[str] | None = None,
        variety_mode: bool = False,
        mode: str = "ingredients",
        device_id: str | None = None,
    ) -> List[Dict[str, Any]]:
        started = time.time()
        # Mobile polling stops at ~60s; Surprise/Quick should complete within that window.
        overall_budget_seconds = 60 if mode in ("surprise", "quick") else 55

        recipes = self.ai.generate_recipes(
            ingredients,
            tier,
            filters=filters,
            exclude_titles=exclude_titles or [],
            variety_mode=variety_mode,
            mode=mode,
            timeout_seconds=overall_budget_seconds,
            generate_images=False,
        )
        recipes = self._validated_recipes_or_none(recipes, mode=mode)
        if recipes is None:
            remaining = overall_budget_seconds - (time.time() - started)
            # One retry (variety on, cache bypassed) only if there is enough time left.
            if remaining <= 8:
                raise RuntimeError("Recipe generation failed. Please try again.")
            recipes_retry = self.ai.generate_recipes(
                ingredients,
                tier,
                filters=filters,
                exclude_titles=exclude_titles or [],
                variety_mode=True,
                mode=mode,
                timeout_seconds=max(8, remaining),
                generate_images=False,
            )
            recipes = self._validated_recipes_or_none(recipes_retry, mode=mode)

        if recipes is None:
            raise RuntimeError("Recipe generation failed. Please try again.")

        record_ai_request(
            db,
            user_id,
            tier,
            "text",
            model_used=tier,
            tokens_used=0,
            cost_estimate=0,
            device_id=device_id,
        )
        db.add(RecipeHistory(user_id=user_id, source="text", recipes=recipes))
        db.commit()
        return recipes

    def _validated_recipes_or_none(
        self,
        recipes: List[Dict[str, Any]] | None,
        *,
        mode: str = "ingredients",
    ) -> List[Dict[str, Any]] | None:
        if not recipes or not isinstance(recipes, list):
            return None
        if len(recipes) < 3:
            return None

        cleaned: list[dict] = []
        for recipe in recipes[:3]:
            if not isinstance(recipe, dict):
                return None
            title = (recipe.get("title") or recipe.get("name") or "").strip()
            if not title or title.lower() == "ai-generated recipe":
                return None
            instructions = recipe.get("instructions") or []
            if not isinstance(instructions, list) or len(instructions) < 3:
                return None
            ingredients = recipe.get("ingredients") or []
            if not isinstance(ingredients, list) or len(ingredients) < 3:
                return None
            ni = recipe.get("nutritional_info") or {}
            calories = ni.get("calories")
            carbs = ni.get("carbs")
            protein = ni.get("protein")
            # Treat missing/zero nutrition as invalid (this is what causes N/A in the UI).
            try:
                calories_n = int(calories or 0)
                carbs_n = int(carbs or 0)
                protein_n = int(protein or 0)
            except Exception:  # noqa: BLE001
                return None
            if calories_n <= 0 or (carbs_n <= 0 and protein_n <= 0):
                return None
            if mode == "quick":
                total_time = recipe.get("total_time")
                if total_time is None or total_time == 0:
                    total_time = recipe.get("totalTime")
                if total_time is None or total_time == 0:
                    total_time = (recipe.get("prep_time") or 0) + (recipe.get("cook_time") or 0)
                try:
                    total_n = int(float(total_time or 0))
                except Exception:  # noqa: BLE001
                    total_n = 0
                if total_n <= 0 or total_n > 20:
                    return None
            cleaned.append(recipe)

        return cleaned
