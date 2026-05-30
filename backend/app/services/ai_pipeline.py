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


class RecipeGenerationError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "generation_failed",
        internal_message: str | None = None,
        error_type: str = "operational",
    ) -> None:
        super().__init__(message)
        self.code = code
        self.internal_message = internal_message or message
        self.error_type = error_type


class AIPipeline:
    """End-to-end AI pipeline: vision -> recipes, with usage tracking."""

    def __init__(self) -> None:
        self.ai = TieredAIService()
        self.classifier = DiabetesFriendlyClassifier()
        self.ingredient_classifier = IngredientClassifier()
        self.risk_classifier = IngredientRiskClassifier()
        self._last_recipe_validation_error = ""

    def _recipe_validation_error(self, reason: str | None, *, retried: bool) -> RecipeGenerationError:
        reason_text = (reason or "unknown").strip()
        internal_prefix = "validation_failed_after_retry" if retried else "validation_failed_no_retry"
        actionable_reasons = (
            "insufficient_source_ingredient_match",
            "too_few_recipes",
            "empty_or_not_list",
        )
        if any(reason_text.startswith(prefix) for prefix in actionable_reasons):
            return RecipeGenerationError(
                "We need a little more balance to build diabetes-friendly recipes. "
                "Add a protein like eggs, chicken, fish, tofu, or beans, plus one non-starchy vegetable.",
                code="recipe_validation_failed",
                internal_message=f"{internal_prefix}: {reason_text}",
                error_type="invalid_input",
            )
        return RecipeGenerationError(
            "Recipe generation is taking longer than expected. Please try again in a moment.",
            code="recipe_validation_failed",
            internal_message=f"{internal_prefix}: {reason_text}",
            error_type="operational",
        )

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
        optional: list[str] = []

        for item in ingredients or []:
            key = (item or "").strip().lower()
            label = (risk_by_name.get(key) or {}).get("risk") or "ok"
            if label == "avoid":
                excluded.append(item)
            elif label in {"caution", "limit", "needs_clarification"}:
                optional.append(item)
            else:
                selected.append(item)

        warning = None
        if excluded or optional:
            warning = {
                "code": "ingredients_flagged",
                "message": "Some detected items were unselected because they may be less suitable for diabetes-friendly recipes.",
                "risk_level": "moderate",
                "source": risks.get("source") or "ai",
                "excluded": excluded,
                "optional": optional,
                "risk_by_name": risk_by_name,
            }

        return selected, (warning or {"risk_by_name": risk_by_name, "source": risks.get("source") or "ai"})

    def _scan_review_warning(
        self,
        warning: dict | None,
        *,
        risk_meta: dict,
        fallback_code: str = "scan_review_required",
        fallback_message: str = "Review the detected ingredients before generating recipes.",
    ) -> dict:
        payload = dict(warning or {})
        payload.setdefault("code", fallback_code)
        payload.setdefault("message", fallback_message)
        payload.setdefault("risk_level", "moderate")
        payload.setdefault("source", risk_meta.get("source") or "ai")
        payload.setdefault("excluded", risk_meta.get("excluded") or [])
        payload.setdefault("optional", risk_meta.get("optional") or [])
        payload.setdefault("risk_by_name", risk_meta.get("risk_by_name") or {})
        return payload

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

    def _ensure_diabetes_friendly_or_raise(
        self,
        ingredients: list[str],
        *,
        mode: str = "ingredients",
        tier: str = "free",
    ) -> None:
        """
        For ingredient-driven flows, block early when the input can't realistically produce a diabetes-friendly
        result without inventing ingredients.
        """
        if (mode or "").strip().lower() in ("surprise", "quick"):
            return

        lowered = [str(x).strip().lower() for x in (ingredients or []) if isinstance(x, str) and str(x).strip()]
        if lowered:
            risks = self.risk_classifier.classify(lowered, tier=tier or "free")
            risk_by_name = risks.get("risk_by_name") or {}
            clarification_items = []
            avoid_items = []
            for item in lowered:
                risk = (risk_by_name.get(item) or {}).get("risk") or "ok"
                reason = (risk_by_name.get(item) or {}).get("reason") or ""
                if risk == "needs_clarification":
                    clarification_items.append((item, reason))
                elif risk == "avoid":
                    avoid_items.append((item, reason))

            if clarification_items:
                item, reason = clarification_items[0]
                raise IngredientValidationError(
                    "needs_clarification",
                    f'"{item}" needs more detail before we generate diabetes-friendly recipes. '
                    f"{reason or 'Please choose a less refined or more specific option.'}",
                )

            if avoid_items:
                item, reason = avoid_items[0]
                raise IngredientValidationError(
                    "not_diabetes_friendly",
                    f'"{item}" is not suitable as a main ingredient for diabetes-friendly recipe generation. '
                    f"{reason or 'Please choose a lower-sugar or less refined option.'}",
                )

            starchy_keywords = [
                "yam",
                "potato",
                "cassava",
                "plantain",
                "rice",
                "pasta",
                "noodle",
                "bread",
                "flour",
                "semolina",
                "garri",
                "fufu",
            ]
            protein_keywords = [
                "chicken",
                "turkey",
                "beef",
                "pork",
                "fish",
                "salmon",
                "tuna",
                "egg",
                "eggs",
                "tofu",
                "beans",
                "lentil",
                "lentils",
                "chickpea",
                "chickpeas",
            ]
            nonstarchy_veg_keywords = [
                "spinach",
                "broccoli",
                "kale",
                "cabbage",
                "zucchini",
                "cauliflower",
                "mushroom",
                "pepper",
                "tomato",
                "cucumber",
                "salad",
                "lettuce",
            ]
            sugary_condiments = ["ketchup", "tomato ketchup", "syrup", "sugar", "honey", "jam"]

            has_starch = any(any(k in item for k in starchy_keywords) for item in lowered)
            has_protein = any(any(k in item for k in protein_keywords) for item in lowered)
            has_nonstarchy_veg = any(any(k in item for k in nonstarchy_veg_keywords) for item in lowered)
            has_sugary_condiment = any(any(k in item for k in sugary_condiments) for item in lowered)

            # Hard stop: starchy/sugary sets without any protein or non-starchy veg cannot be made truly diabetes-friendly
            # without inventing ingredients.
            if (has_starch or has_sugary_condiment) and not (has_protein or has_nonstarchy_veg):
                raise IngredientValidationError(
                    "not_diabetes_friendly",
                    "These ingredients can't reliably make a diabetes-friendly meal. Add at least one protein (eggs/fish/chicken/beans/tofu) "
                    "and one non-starchy veg (spinach/broccoli/salad), then try again.",
                )
        verdict = self.classifier.classify(ingredients or [])
        if verdict.get("diabetes_friendly"):
            return
        reason = verdict.get("reason") or "Ingredients may not be diabetes-friendly."
        raise IngredientValidationError(
            "not_diabetes_friendly",
            f"{reason} Add at least one protein (eggs/fish/chicken/beans) and one non-starchy veg (spinach/broccoli/salad), then try again.",
        )

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
        if include_recipes:
            warning = (
                risk_meta
                if risk_meta.get("code")
                else (self._get_diabetes_warning(selected_food_only) if selected_food_only else None) or risk_meta
            )
        else:
            warning = self._scan_review_warning(
                risk_meta if risk_meta.get("code") else None,
                risk_meta=risk_meta,
                fallback_message="Review the detected ingredients before generating recipes.",
            )
        if include_recipes:
            try:
                self._ensure_diabetes_friendly_or_raise(selected_food_only, mode="ingredients", tier=tier)
            except IngredientValidationError as exc:
                warning = self._scan_review_warning(
                    warning if isinstance(warning, dict) else None,
                    risk_meta=risk_meta,
                    fallback_code=exc.code,
                    fallback_message=exc.message,
                )
                include_recipes = False
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
                raise self._recipe_validation_error(self._last_recipe_validation_error, retried=True)
            record_ai_request(db, user_id, tier, "recipes", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
            db.add(RecipeHistory(user_id=user_id, source="vision", recipes=recipes))
            db.commit()
        return {
            "recipes": recipes,
            "detected": selected_food_only,
            "detected_all": food_only,
            "flagged_out": (warning or {}).get("excluded", []) if isinstance(warning, dict) else [],
            "flagged_optional": (warning or {}).get("optional", []) if isinstance(warning, dict) else [],
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
        if include_recipes:
            warning = (
                risk_meta
                if risk_meta.get("code")
                else (self._get_diabetes_warning(selected_food_only) if selected_food_only else None) or risk_meta
            )
        else:
            warning = self._scan_review_warning(
                risk_meta if risk_meta.get("code") else None,
                risk_meta=risk_meta,
                fallback_message="Review the detected ingredients before generating recipes.",
            )
        if include_recipes:
            try:
                self._ensure_diabetes_friendly_or_raise(selected_food_only, mode="ingredients", tier=tier)
            except IngredientValidationError as exc:
                warning = self._scan_review_warning(
                    warning if isinstance(warning, dict) else None,
                    risk_meta=risk_meta,
                    fallback_code=exc.code,
                    fallback_message=exc.message,
                )
                include_recipes = False
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
                raise self._recipe_validation_error(self._last_recipe_validation_error, retried=True)
            record_ai_request(db, user_id, tier, "recipes", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
            db.add(RecipeHistory(user_id=user_id, source="vision", recipes=recipes))
            db.commit()
        return {
            "recipes": recipes,
            "detected": selected_food_only,
            "detected_all": food_only,
            "flagged_out": (warning or {}).get("excluded", []) if isinstance(warning, dict) else [],
            "flagged_optional": (warning or {}).get("optional", []) if isinstance(warning, dict) else [],
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
        overall_budget_seconds = float(settings.ai_eat_now_budget_seconds) if mode in ("surprise", "quick") else 60.0

        self._ensure_diabetes_friendly_or_raise(self._cap_recipe_ingredients(ingredients), mode=mode, tier=tier)

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
            first_validation_error = self._last_recipe_validation_error
            remaining = overall_budget_seconds - (time.time() - started)
            # One retry (variety on, cache bypassed) only if there is enough time left.
            if remaining <= 8:
                raise self._recipe_validation_error(first_validation_error, retried=False)
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
            raise self._recipe_validation_error(self._last_recipe_validation_error, retried=True)

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
        import re

        self._last_recipe_validation_error = ""

        def _fail(reason: str) -> None:
            self._last_recipe_validation_error = reason
            if settings.ai_debug_logging:
                logger.info("AI validation failed mode=%s reason=%s", mode, reason)
            return None

        if not recipes or not isinstance(recipes, list):
            return _fail("empty_or_not_list")
        if len(recipes) < 3:
            return _fail(f"too_few_recipes:{len(recipes)}")

        # Keep recipe generation grounded in the user's ingredients while allowing normal wording,
        # pluralization, and harmless supporting ingredients.
        pantry_staples = {
            "water",
            "salt",
            "pepper",
            "black pepper",
            "chili",
            "chilli",
            "dried herbs",
            "herbs",
            "spices",
            "garlic",
            "onion",
            "lemon",
            "lime",
            "vinegar",
            "olive oil",
            "oil",
        }

        def _norm(text: str) -> str:
            t = (text or "").strip().lower()
            t = re.sub(r"[^a-z0-9\s]+", " ", t)
            t = re.sub(r"\s+", " ", t).strip()
            return t

        def _variants(text: str) -> set[str]:
            base = _norm(text)
            out = {base} if base else set()
            words = base.split()
            variant_words: list[str] = []
            for word in words:
                if word.endswith("ies") and len(word) > 4:
                    variant_words.append(f"{word[:-3]}y")
                elif word.endswith("oes") and len(word) > 4:
                    variant_words.append(word[:-2])
                elif word.endswith("es") and len(word) > 3:
                    variant_words.append(word[:-2])
                elif word.endswith("s") and len(word) > 3:
                    variant_words.append(word[:-1])
                else:
                    variant_words.append(word)
            singular = " ".join(variant_words).strip()
            if singular:
                out.add(singular)
            return out

        def _source_terms(items: list[str] | None) -> list[str]:
            terms: list[str] = []
            seen: set[str] = set()
            for item in items or []:
                if not isinstance(item, str) or not item.strip():
                    continue
                raw = item.strip()
                candidates = [raw]
                # Users and AI precheck can produce combined phrases like
                # "tomatoes and cayenne pepper". Match those as individual foods too.
                candidates.extend(
                    part.strip()
                    for part in re.split(r"\s+(?:and|with|plus)\s+|[,&/]+", raw, flags=re.IGNORECASE)
                    if part.strip()
                )
                for candidate in candidates:
                    normalized = _norm(candidate)
                    if normalized and normalized not in seen:
                        terms.append(candidate)
                        seen.add(normalized)
            return terms

        src_norm: list[str] = []
        src_set: set[str] = set()
        src_variants: set[str] = set()
        expanded_source_ingredients = _source_terms(source_ingredients)
        if source_ingredients:
            src_norm = [_norm(str(x)) for x in expanded_source_ingredients if isinstance(x, str) and str(x).strip()]
            src_set = {x for x in src_norm if x}
            for src_item in expanded_source_ingredients:
                if isinstance(src_item, str) and src_item.strip():
                    src_variants.update(_variants(src_item))

        def _matches_source(ingredient_name: str) -> bool:
            n = _norm(ingredient_name)
            if not n:
                return True
            if n in pantry_staples:
                return True
            ingredient_variants = _variants(n)
            if n in src_set or bool(ingredient_variants & src_variants):
                return True
            # Substring match (bounded) to handle simple variants like "ketchup" vs "tomato ketchup".
            for s in src_variants or src_norm:
                if not s:
                    continue
                for variant in ingredient_variants:
                    if f" {s} " in f" {variant} ":
                        return True
                    if f" {variant} " in f" {s} ":
                        return True
            return False

        def _has_banned_placeholders(instructions_text: str, allowed_text: str) -> bool:
            # Block placeholder instructions like "cook protein" without rejecting helpful nutrition wording.
            placeholders = [
                "cook protein",
                "prep protein",
                "prepare protein",
                "add protein",
                "your protein",
                "chosen protein",
                "preferred protein",
            ]
            for phrase in placeholders:
                if phrase in instructions_text and "protein" not in allowed_text:
                    return True
            return False

        cleaned: list[dict] = []
        for recipe in recipes[:3]:
            if not isinstance(recipe, dict):
                return _fail("recipe_not_dict")
            title = (recipe.get("title") or recipe.get("name") or "").strip()
            if not title or title.lower() == "ai-generated recipe":
                return _fail(f"bad_title:{title[:120]}")
            instructions = recipe.get("instructions") or []
            if not isinstance(instructions, list) or len(instructions) < 3:
                return _fail(f"bad_instructions_len:{len(instructions) if isinstance(instructions, list) else 'n/a'}")
            ingredients = recipe.get("ingredients") or []
            if not isinstance(ingredients, list) or len(ingredients) < 3:
                return _fail(f"bad_ingredients_len:{len(ingredients) if isinstance(ingredients, list) else 'n/a'}")

            # Ensure the recipe content actually references the detected ingredients (avoid placeholder/fallback output),
            # and does NOT invent non-pantry ingredients.
            if source_ingredients:
                try:
                    src = [
                        str(x).strip().lower()
                        for x in expanded_source_ingredients
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
                    used_sources: set[str] = set()
                    for s in src:
                        if not s:
                            continue
                        if any(f" {variant} " in f" {hay} " for variant in _variants(s)):
                            used_sources.add(s)
                    original_source_count = len(
                        [x for x in source_ingredients if isinstance(x, str) and str(x).strip()]
                    )
                    min_required = 1 if original_source_count <= 1 or len(src) <= 1 else 2
                    if len(used_sources) < min_required:
                        return _fail(f"insufficient_source_ingredient_match:{len(used_sources)}")

                    # The recipe must use the user's ingredients, but do not fail the whole request for harmless
                    # synonyms/supporting ingredients. The prompt still tells the model not to add extras.
                    for ing in ingredients or []:
                        if isinstance(ing, dict):
                            nm = str(ing.get("name") or ing.get("title") or "").strip()
                        else:
                            nm = str(ing or "").strip()
                        if not nm:
                            continue
                        if "optional:" in nm.lower():
                            return _fail("optional_prefix_present")

                    allowed_parts = [_norm(x) for x in src]
                    for ing in ingredients or []:
                        if isinstance(ing, dict):
                            nm = str(ing.get("name") or ing.get("title") or "").strip()
                        else:
                            nm = str(ing or "").strip()
                        if nm:
                            allowed_parts.append(_norm(nm))
                    allowed_text = " ".join([p for p in allowed_parts if p])
                    if _has_banned_placeholders(instr_text, allowed_text):
                        return _fail("instruction_mentions_missing_placeholder")
                except Exception:
                    # If this check fails unexpectedly, don't block otherwise valid recipes.
                    pass
            ni = recipe.get("nutritional_info") or recipe.get("nutrition_per_serving") or recipe.get("nutrition") or {}
            calories = ni.get("calories")
            carbs = ni.get("carbs")
            protein = ni.get("protein")
            # Treat missing/zero nutrition as invalid (this is what causes N/A in the UI).
            try:
                calories_n = int(calories or 0)
                carbs_n = int(carbs or 0)
                protein_n = int(protein or 0)
            except Exception:  # noqa: BLE001
                return _fail("non_numeric_nutrition")
            if calories_n <= 0 or (carbs_n <= 0 and protein_n <= 0):
                return _fail(f"missing_nutrition:cal={calories_n},carbs={carbs_n},protein={protein_n}")
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
                    return _fail(f"total_time_out_of_range:{total_n}")
            cleaned.append(recipe)

        return cleaned
