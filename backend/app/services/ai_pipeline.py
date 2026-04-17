import logging
import time
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from ..core.config import settings
from ..services.tiered_ai_service import TieredAIService
from ..models.recipe_history import RecipeHistory
from ..models.user import User
from .diabetes_friendly_classifier import DiabetesFriendlyClassifier
from .ingredient_classifier import IngredientClassifier
from .cost_tracker import record_ai_request
from .food_profile_service import extract_food_profile
from .ingredient_risk_classifier import IngredientRiskClassifier


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
        self.risk_classifier = IngredientRiskClassifier()

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

    def _apply_risk_filter(self, ingredients: list[str], *, tier: str) -> tuple[list[str], dict]:
        """
        Decide which detected foods should be "selected" as primary recipe inputs.

        This is AI-driven (not hardcoded): we ask the model to tag each ingredient as:
        - ok (keep in selected list)
        - limit (treat as optional, not selected)
        - avoid (exclude from selected)
        """
        risks = self.risk_classifier.classify(ingredients, tier=tier)
        risk_by_name = risks.get("risk_by_name") or {}

        selected: list[str] = []
        excluded: list[str] = []

        for item in ingredients or []:
            key = (item or "").strip().lower()
            label = (risk_by_name.get(key) or {}).get("risk") or "ok"
            if label == "avoid":
                excluded.append(item)
            else:
                selected.append(item)

        warning = None
        if excluded:
            warning = {
                "code": "ingredients_flagged",
                "message": "Some ingredients were excluded for better diabetes-friendly results.",
                "risk_level": "moderate",
                "source": risks.get("source") or "ai",
                "excluded": excluded,
                "risk_by_name": risk_by_name,
            }

        return selected, (warning or {"risk_by_name": risk_by_name, "source": risks.get("source") or "ai"})

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

    def _cap_recipe_ingredients(self, ingredients: list[str], *, limit: int = 18) -> list[str]:
        """
        Keep recipe generation inputs bounded to reduce latency and invalid/truncated JSON outputs.

        Vision scans can detect dozens of items; passing them all makes prompts long and model outputs more likely
        to truncate mid-JSON.
        """
        try:
            n = int(limit)
        except Exception:  # noqa: BLE001
            n = 18
        n = max(5, min(30, n))
        if not ingredients:
            return ingredients
        return list(ingredients[:n])

    def fridge_to_recipes(
        self,
        db: Session,
        user_id: int,
        tier: str,
        image_base64: str,
        filters: list[str] | None = None,
        device_id: str | None = None,
        include_recipes: bool = True,
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
        selected_food_only, flagged = self._apply_risk_filter(food_only, tier=tier)
        selected_food_only = self._cap_recipe_ingredients(selected_food_only)
        risk_meta = flagged if isinstance(flagged, dict) else {}
        warning = self._get_diabetes_warning(selected_food_only) or risk_meta
        if non_food and (not isinstance(warning, dict) or not warning.get("code")):
            warning = {
                "code": "non_food_ignored",
                "message": "Some items were not food ingredients and were ignored.",
                "risk_level": "low",
                "source": classified.get("source", "rules"),
                "risk_by_name": risk_meta.get("risk_by_name") or {},
            }
        recipes: list[dict] = []
        record_ai_request(db, user_id, tier, "vision", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        if include_recipes:
            recipes = self.ai.generate_recipes(
                selected_food_only,
                tier,
                filters=filters,
                timeout_seconds=55,
                generate_images=False,
                food_profile=food_profile,
            )
            recipes = self._validated_recipes_or_none(recipes, source_ingredients=selected_food_only) or []
            if not recipes:
                recipes_retry = self.ai.generate_recipes(
                    selected_food_only,
                    tier,
                    filters=filters,
                    variety_mode=True,
                    timeout_seconds=55,
                    generate_images=False,
                    food_profile=food_profile,
                )
                recipes = self._validated_recipes_or_none(recipes_retry, source_ingredients=selected_food_only) or []
            if not recipes:
                raise RuntimeError("Recipe generation failed. Please try again.")
            record_ai_request(db, user_id, tier, "recipes", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
            db.add(RecipeHistory(user_id=user_id, source="vision", recipes=recipes))
            db.commit()
        return {
            "recipes": recipes,
            "detected": selected_food_only,
            "detected_all": food_only,
            "flagged_out": (warning or {}).get("excluded", []) if isinstance(warning, dict) else [],
            "flagged_optional": [],
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
        include_recipes: bool = True,
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
        selected_food_only, flagged = self._apply_risk_filter(food_only, tier=tier)
        # Multi-image scans can yield many ingredients; keep recipe generation inputs tighter to reduce
        # truncation/invalid JSON and improve latency.
        selected_food_only = self._cap_recipe_ingredients(selected_food_only, limit=14)
        risk_meta = flagged if isinstance(flagged, dict) else {}
        warning = self._get_diabetes_warning(selected_food_only) or risk_meta
        if non_food and (not isinstance(warning, dict) or not warning.get("code")):
            warning = {
                "code": "non_food_ignored",
                "message": "Some items were not food ingredients and were ignored.",
                "risk_level": "low",
                "source": classified.get("source", "rules"),
                "risk_by_name": risk_meta.get("risk_by_name") or {},
            }
        recipes: list[dict] = []
        record_ai_request(db, user_id, tier, "vision_batch", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        if include_recipes:
            recipes = self.ai.generate_recipes(
                selected_food_only,
                tier,
                filters=filters,
                timeout_seconds=55,
                generate_images=False,
                food_profile=food_profile,
            )
            recipes = self._validated_recipes_or_none(recipes, source_ingredients=selected_food_only) or []
            if not recipes:
                recipes_retry = self.ai.generate_recipes(
                    selected_food_only,
                    tier,
                    filters=filters,
                    variety_mode=True,
                    timeout_seconds=55,
                    generate_images=False,
                    food_profile=food_profile,
                )
                recipes = self._validated_recipes_or_none(recipes_retry, source_ingredients=selected_food_only) or []
            if not recipes:
                raise RuntimeError("Recipe generation failed. Please try again.")
            record_ai_request(db, user_id, tier, "recipes", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
            db.add(RecipeHistory(user_id=user_id, source="vision", recipes=recipes))
            db.commit()
        return {
            "recipes": recipes,
            "detected": selected_food_only,
            "detected_all": food_only,
            "flagged_out": (warning or {}).get("excluded", []) if isinstance(warning, dict) else [],
            "flagged_optional": [],
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
        # "Eat now" flows should stay tight for UX, but "Type ingredients" is async and can take longer.
        # Increasing the budget reduces false "Request failed" when providers have brief latency spikes.
        overall_budget_seconds = float(settings.ai_eat_now_budget_seconds) if mode in ("surprise", "quick") else 85.0

        recipes = self.ai.generate_recipes(
            self._cap_recipe_ingredients(ingredients),
            tier,
            filters=filters,
            exclude_titles=exclude_titles or [],
            variety_mode=variety_mode,
            mode=mode,
            timeout_seconds=overall_budget_seconds,
            generate_images=False,
            food_profile=food_profile,
        )
        recipes = self._validated_recipes_or_none(recipes, mode=mode, source_ingredients=ingredients)
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
            recipes = self._validated_recipes_or_none(recipes_retry, mode=mode, source_ingredients=ingredients)

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
        source_ingredients: list[str] | None = None,
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

            # Ensure the recipe content actually references the detected ingredients (avoid placeholder/fallback output).
            if source_ingredients:
                try:
                    src = [
                        str(x).strip().lower()
                        for x in source_ingredients
                        if isinstance(x, str) and str(x).strip()
                    ]
                    ing_text = " ".join(
                        [
                            str((x.get("name") if isinstance(x, dict) else x) or "").lower()
                            for x in (ingredients or [])
                        ]
                    )
                    title_text = (title or "").lower()
                    instr_text = " ".join([str(s).lower() for s in (instructions or []) if isinstance(s, str)])
                    hay = f"{title_text} {ing_text} {instr_text}"
                    used = any(s and (s in hay) for s in src)
                    if not used:
                        if settings.ai_debug_logging:
                            logger.info("AI validation failed mode=%s reason=no_source_ingredient_match", mode)
                        return None
                except Exception:
                    # If this check fails unexpectedly, don't block otherwise valid recipes.
                    pass
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
