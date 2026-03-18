from typing import Any, Dict, List
import logging
import time

from sqlalchemy.orm import Session

from ..core.config import settings
from ..services.tiered_ai_service import TieredAIService
from ..models.recipe_history import RecipeHistory
from ..models.user import User
from .diabetes_friendly_classifier import DiabetesFriendlyClassifier
from .ingredient_classifier import IngredientClassifier
from .cost_tracker import record_ai_request
from .food_profile_service import extract_food_profile


logger = logging.getLogger(__name__)


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

    def _filter_diabetes_risky_ingredients(self, ingredients: list[str]) -> tuple[list[str], dict | None]:
        """
        Practical UX filter to avoid "diabetes-friendly" recipes being driven by sugary drinks / sweet condiments.

        - Excludes common sugary beverages/sweeteners from recipe-generation input.
        - Treats some condiments/fats as optional (not forced into the "ONLY ingredients" list).

        This is NOT medical advice; it just improves recipe quality and user trust.
        """
        if not ingredients:
            return ingredients, None

        import re

        exclude_patterns = [
            r"\b(juice|fruit\s+juice|orange\s+juice|apple\s+juice|mango\s+juice|pineapple\s+juice)\b",
            r"\b(soda|cola|soft\s+drink|energy\s+drink|sports\s+drink)\b",
            r"\b(syrup|maple\s+syrup|honey|sweetened\s+condensed\s+milk)\b",
        ]
        optional_patterns = [
            r"\b(ketchup|tomato\s+ketchup)\b",
            r"\b(bbq\s+sauce|barbecue\s+sauce)\b",
            r"\b(sweet\s+chili|chili\s+sauce)\b",
            r"\b(margarine)\b",
            r"\b(cream|heavy\s+cream|whipping\s+cream)\b",
            r"\b(butter)\b",
        ]

        excluded: list[str] = []
        optional: list[str] = []
        keep: list[str] = []

        for item in ingredients:
            if not isinstance(item, str) or not item.strip():
                continue
            text = item.strip().lower()
            if any(re.search(pattern, text) for pattern in exclude_patterns):
                excluded.append(item)
                continue
            if any(re.search(pattern, text) for pattern in optional_patterns):
                optional.append(item)
                continue
            keep.append(item)

        warning = None
        if excluded or optional:
            message_parts = []
            if excluded:
                message_parts.append("Some sugary drinks/sweeteners were ignored for recipe generation.")
            if optional:
                message_parts.append("Some condiments/fats were treated as optional.")
            warning = {
                "code": "ingredients_flagged",
                "message": " ".join(message_parts).strip()
                or "Some ingredients were treated as optional for diabetes-friendly recipe generation.",
                "risk_level": "moderate",
                "source": "rules",
                "excluded": excluded,
                "optional": optional,
            }

        return keep, warning

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
        user = db.query(User).filter(User.id == user_id).first()
        food_profile = extract_food_profile(user) if user else None
        analysis = self.ai.analyze_vision(image_base64, tier)
        ingredients = self._clean_ingredients(analysis.get("ingredients", []))
        self._validate_ingredients(ingredients)
        classified = self.ingredient_classifier.classify(ingredients)
        food_only = classified.get("food", [])
        non_food = classified.get("non_food", [])
        self._validate_ingredients(food_only)
        filtered_food_only, flagged_warning = self._filter_diabetes_risky_ingredients(food_only)
        warning = flagged_warning or self._get_diabetes_warning(filtered_food_only)
        if non_food and not warning:
            warning = {
                "code": "non_food_ignored",
                "message": "Some items were not food ingredients and were ignored.",
                "risk_level": "low",
                "source": classified.get("source", "rules"),
            }
        recipes = self.ai.generate_recipes(
            filtered_food_only,
            tier,
            filters=filters,
            timeout_seconds=55,
            generate_images=False,
            food_profile=food_profile,
        )
        recipes = self._validated_recipes_or_none(recipes)
        if recipes is None:
            recipes_retry = self.ai.generate_recipes(
                filtered_food_only,
                tier,
                filters=filters,
                variety_mode=True,
                timeout_seconds=55,
                generate_images=False,
                food_profile=food_profile,
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
            "detected": filtered_food_only,
            "detected_all": food_only,
            "flagged_out": (flagged_warning or {}).get("excluded", []) if isinstance(flagged_warning, dict) else [],
            "flagged_optional": (flagged_warning or {}).get("optional", []) if isinstance(flagged_warning, dict) else [],
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
        user = db.query(User).filter(User.id == user_id).first()
        food_profile = extract_food_profile(user) if user else None
        all_ingredients: list[str] = []
        images_base64 = [img for img in (images_base64 or []) if isinstance(img, str) and img.strip()]
        analysis = self.ai.analyze_vision_batch(images_base64, tier) if images_base64 else {"ingredients": []}
        detected = analysis.get("ingredients", [])
        if isinstance(detected, list):
            all_ingredients.extend([str(x).strip() for x in detected if isinstance(x, str) and str(x).strip()])

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
        filtered_food_only, flagged_warning = self._filter_diabetes_risky_ingredients(food_only)
        warning = flagged_warning or self._get_diabetes_warning(filtered_food_only)
        if non_food and not warning:
            warning = {
                "code": "non_food_ignored",
                "message": "Some items were not food ingredients and were ignored.",
                "risk_level": "low",
                "source": classified.get("source", "rules"),
            }
        recipes = self.ai.generate_recipes(
            filtered_food_only,
            tier,
            filters=filters,
            timeout_seconds=55,
            generate_images=False,
            food_profile=food_profile,
        )
        recipes = self._validated_recipes_or_none(recipes)
        if recipes is None:
            recipes_retry = self.ai.generate_recipes(
                filtered_food_only,
                tier,
                filters=filters,
                variety_mode=True,
                timeout_seconds=55,
                generate_images=False,
                food_profile=food_profile,
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
            "detected": filtered_food_only,
            "detected_all": food_only,
            "flagged_out": (flagged_warning or {}).get("excluded", []) if isinstance(flagged_warning, dict) else [],
            "flagged_optional": (flagged_warning or {}).get("optional", []) if isinstance(flagged_warning, dict) else [],
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
        user = db.query(User).filter(User.id == user_id).first()
        food_profile = extract_food_profile(user) if user else None
        if settings.ai_debug_logging and mode in ("surprise", "quick") and food_profile:
            try:
                logger.info(
                    "AI food profile applied mode=%s goals=%s cuisines=%s dietary=%s equipment=%s cook_time=%s",
                    mode,
                    (food_profile.get("meal_goals") or [])[:4],
                    (food_profile.get("preferred_cuisines") or [])[:3],
                    food_profile.get("dietary_pattern"),
                    (food_profile.get("available_equipment") or [])[:6],
                    food_profile.get("cook_time_preference"),
                )
            except Exception:
                pass
        started = time.time()
        # Mobile polling stops at ~60s; Surprise/Quick should complete within that window.
        overall_budget_seconds = (
            float(settings.ai_eat_now_budget_seconds) if mode in ("surprise", "quick") else 55.0
        )

        recipes = self.ai.generate_recipes(
            ingredients,
            tier,
            filters=filters,
            exclude_titles=exclude_titles or [],
            variety_mode=variety_mode,
            mode=mode,
            timeout_seconds=overall_budget_seconds,
            generate_images=False,
            food_profile=food_profile,
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
                food_profile=food_profile,
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
                if settings.ai_debug_logging and mode in ("surprise", "quick"):
                    logger.info("AI validation failed mode=%s reason=recipe_not_dict", mode)
                return None
            title = (recipe.get("title") or recipe.get("name") or "").strip()
            if not title or title.lower() == "ai-generated recipe":
                if settings.ai_debug_logging and mode in ("surprise", "quick"):
                    logger.info("AI validation failed mode=%s reason=bad_title title=%s", mode, title[:120])
                return None
            instructions = recipe.get("instructions") or []
            if not isinstance(instructions, list) or len(instructions) < 3:
                if settings.ai_debug_logging and mode in ("surprise", "quick"):
                    logger.info(
                        "AI validation failed mode=%s reason=bad_instructions_len len=%s",
                        mode,
                        (len(instructions) if isinstance(instructions, list) else "n/a"),
                    )
                return None
            ingredients = recipe.get("ingredients") or []
            if not isinstance(ingredients, list) or len(ingredients) < 3:
                if settings.ai_debug_logging and mode in ("surprise", "quick"):
                    logger.info(
                        "AI validation failed mode=%s reason=bad_ingredients_len len=%s",
                        mode,
                        (len(ingredients) if isinstance(ingredients, list) else "n/a"),
                    )
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
                if settings.ai_debug_logging and mode in ("surprise", "quick"):
                    logger.info("AI validation failed mode=%s reason=non_numeric_nutrition", mode)
                return None
            if calories_n <= 0 or (carbs_n <= 0 and protein_n <= 0):
                if settings.ai_debug_logging and mode in ("surprise", "quick"):
                    logger.info(
                        "AI validation failed mode=%s reason=missing_nutrition cal=%s carbs=%s protein=%s",
                        mode,
                        calories_n,
                        carbs_n,
                        protein_n,
                    )
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
                    if settings.ai_debug_logging:
                        logger.info("AI validation failed mode=%s reason=total_time_out_of_range total=%s", mode, total_n)
                    return None
            cleaned.append(recipe)

        return cleaned
