from typing import Any, Dict, List

from sqlalchemy.orm import Session

from ..services.tiered_ai_service import TieredAIService
from ..models.recipe_history import RecipeHistory
from .diabetes_friendly_classifier import DiabetesFriendlyClassifier
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

    def _validate_ingredients(self, ingredients: list[str]) -> None:
        if not ingredients:
            raise IngredientValidationError("not_food", "Image not related to food.")

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
        ingredients = analysis.get("ingredients", [])
        self._validate_ingredients(ingredients)
        warning = self._get_diabetes_warning(ingredients)
        recipes = self.ai.generate_recipes(ingredients, tier, filters=filters)
        record_ai_request(db, user_id, tier, "vision", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        record_ai_request(db, user_id, tier, "recipes", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        db.add(RecipeHistory(user_id=user_id, source="vision", recipes=recipes))
        db.commit()
        return {"recipes": recipes, "detected": ingredients, "filters": filters or [], "warning": warning}

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

        self._validate_ingredients(unique)
        warning = self._get_diabetes_warning(unique)
        recipes = self.ai.generate_recipes(unique, tier, filters=filters)
        record_ai_request(db, user_id, tier, "vision_batch", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        record_ai_request(db, user_id, tier, "recipes", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        db.add(RecipeHistory(user_id=user_id, source="vision", recipes=recipes))
        db.commit()
        return {"recipes": recipes, "detected": unique, "filters": filters or [], "warning": warning}
    def text_to_recipes(
        self,
        db: Session,
        user_id: int,
        tier: str,
        ingredients: List[str],
        filters: list[str] | None = None,
        device_id: str | None = None,
    ) -> List[Dict[str, Any]]:
        recipes = self.ai.generate_recipes(ingredients, tier, filters=filters)
        record_ai_request(db, user_id, tier, "text", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        db.add(RecipeHistory(user_id=user_id, source="text", recipes=recipes))
        db.commit()
        return recipes
