import logging
import hashlib
from typing import Any, Dict, List

from openai import OpenAI, OpenAIError

from ..core.config import settings
from ..core.constants import OPENAI_PROMPT
from ..services.cache_service import CacheService

logger = logging.getLogger(__name__)


class AIRecipeGenerator:
    """GPT-5 recipe generator with DeepSeek fallback."""

    def __init__(self) -> None:
        self.primary_client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
        self.primary_model = settings.openai_model
        self.image_model = "dall-e-3"
        # DeepSeek fallback for text (vision not supported)
        self.fallback_client = (
            OpenAI(api_key=settings.deepseek_api_key, base_url=settings.deepseek_base_url)
            if settings.deepseek_api_key
            else None
        )
        self.fallback_model = settings.deepseek_model
        self.enabled = bool(self.primary_client or self.fallback_client)
        self.cache = CacheService()

    def _call(self, client: OpenAI, model: str, ingredients: List[str], filters: List[str]) -> str:
        # Avoid KeyError from braces in the JSON template; replace only the {ingredients} token.
        prompt = OPENAI_PROMPT.replace("{ingredients}", ", ".join(ingredients))
        if filters:
            prompt += f"\nApply dietary filters: {', '.join(filters)}."
        params = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a diabetes-safe recipe generator."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.4,
        }
        # Some newer models use max_completion_tokens instead of max_tokens
        if model.startswith("gpt-5"):
            params["max_completion_tokens"] = 2000
        else:
            params["max_tokens"] = 2000
        base = str(getattr(client, "base_url", ""))
        if "openai" in base or base == "" or base is None:
            # OpenAI supports response_format for strict JSON
            params["response_format"] = {"type": "json_object"}
        resp = client.chat.completions.create(**params)
        return resp.choices[0].message.content or ""

    def _placeholder_image(self, recipe: Dict[str, Any]) -> str:
        # Simple category-based placeholder to avoid blank spaces
        tags = [t.lower() for t in recipe.get("tags") or []]
        if any("fish" in t or "omega" in t for t in tags):
            return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80"
        if any("protein" in t or "chicken" in t for t in tags):
            return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80"
        return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80"

    def _image_cache_key(self, recipe: Dict[str, Any]) -> str:
        title = recipe.get("title") or recipe.get("name") or ""
        desc = recipe.get("description") or ""
        return f"img:{hashlib.sha256((title + desc).encode()).hexdigest()}"

    def _attach_images(self, recipes: List[Dict[str, Any]], tier: str, ingredients: List[str]) -> None:
        """For premium, try DALL-E images; for free or failures, set placeholders."""
        import hashlib

        is_premium = tier == "premium"
        if not recipes:
            return

        for recipe in recipes:
            # Skip if already has an image
            if recipe.get("image_url"):
                continue

            # Free tier: placeholders only
            if not is_premium or not self.primary_client:
                recipe["image_url"] = self._placeholder_image(recipe)
                continue

            # Premium: attempt cached DALL-E image
            cache_key = self._image_cache_key(recipe)
            cached = self.cache.get(cache_key)
            if cached:
                recipe["image_url"] = cached
                continue

            title = recipe.get("title", "diabetes-friendly meal")
            description = recipe.get("description") or ""
            ingredient_names = []
            for item in recipe.get("ingredients") or []:
                if isinstance(item, dict):
                    name = item.get("name")
                else:
                    name = str(item)
                if name:
                    ingredient_names.append(name)
            prompt = (
                f"Photorealistic food photography of {title}. "
                f"{description} " if description else f"Photorealistic food photography of {title}. "
            )
            if ingredient_names:
                prompt += (
                    "Must visually include these ingredients: "
                    f"{', '.join(ingredient_names)}. "
                    "Do not include ingredients not listed. "
                )
            elif ingredients:
                prompt += (
                    "Must visually reflect these ingredients: "
                    f"{', '.join(ingredients)}. "
                    "Do not include ingredients not listed. "
                )
            prompt += (
                "Clean, modern plating. Natural soft light. 1:1 aspect. No text, no watermarks."
            )
            try:
                resp = self.primary_client.images.generate(
                    model=self.image_model,
                    prompt=prompt,
                    size="512x512",
                    quality="standard",
                    n=1,
                )
                url = resp.data[0].url if resp and resp.data else None
                recipe["image_url"] = url or self._placeholder_image(recipe)
                # Cache for 24h
                if url:
                    self.cache.set(cache_key, url, ttl_seconds=86400)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Image generation failed for '%s': %s", recipe.get("title"), exc)
                recipe["image_url"] = self._placeholder_image(recipe)

    def generate(self, ingredients: List[str], tier: str, filters: List[str] | None = None) -> List[Dict[str, Any]]:
        filters = filters or []
        from ..core.constants import TIER_CONFIG  # local import to avoid cycle
        tier_cfg = TIER_CONFIG.get(tier, {})
        model_chain: List[str] = tier_cfg.get("recipe_models") or [self.primary_model]

        def parse_content(raw: str) -> List[Dict[str, Any]]:
            import json, re

            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```[a-zA-Z]*", "", cleaned)
                cleaned = cleaned.strip("`").strip()
            try:
                data = json.loads(cleaned)
                if isinstance(data, dict):
                    data = data.get("recipes") or [data]
                if isinstance(data, list):
                    normalized: List[Dict[str, Any]] = []
                    for item in data:
                        if not isinstance(item, dict):
                            continue
                        # Map prompt schema -> API schema
                        item["title"] = item.get("title") or item.get("name") or "AI-Generated Recipe"
                        ni_src = item.get("nutritional_info") or item.get("nutrition_per_serving") or {}
                        item["nutritional_info"] = {
                            "calories": ni_src.get("calories"),
                            "carbs": ni_src.get("carbs"),
                            "protein": ni_src.get("protein"),
                            "fat": ni_src.get("fat"),
                            "fiber": ni_src.get("fiber"),
                            "sugar": ni_src.get("sugar"),
                            "glycemic_index": ni_src.get("glycemic_index"),
                        }
                        description = item.get("description") or ""
                        analysis = item.get("diabetes_analysis")
                        if not description and isinstance(analysis, dict):
                            glycemic = analysis.get("glycemic_impact") or analysis.get("glycemic impact")
                            carb_type = analysis.get("carb_type") or analysis.get("carb type")
                            safety = analysis.get("safety_rating") or analysis.get("safety rating")
                            parts = []
                            if glycemic:
                                parts.append(f"{glycemic.lower()} glycemic impact")
                            if carb_type:
                                parts.append(f"{carb_type.lower()} carbs")
                            if safety:
                                parts.append(f"{safety} safety rating")
                            if parts:
                                description = "Diabetes-friendly option with " + ", ".join(parts) + "."
                        item.setdefault("description", description or "Diabetes-friendly recipe.")
                        item.setdefault("instructions", item.get("instructions") or [])
                        item.setdefault("ingredients", item.get("ingredients") or [])
                        item.setdefault("prep_time", item.get("prep_time", 0))
                        item.setdefault("cook_time", item.get("cook_time", 0))
                        item.setdefault("total_time", item.get("total_time", item["prep_time"] + item["cook_time"]))
                        item.setdefault("difficulty", item.get("difficulty") or "Easy")
                        item.setdefault("tags", item.get("tags") or [])
                        item.setdefault("servings", item.get("servings") or 2)
                        normalized.append(item)
                    if normalized:
                        return normalized
            except Exception:
                pass
            return [
                {
                    "title": "AI-Generated Recipe",
                    "description": cleaned[:200],
                    "ingredients": [{"name": i, "quantity": 1, "unit": ""} for i in ingredients],
                    "instructions": [],
                    "prep_time": 0,
                    "cook_time": 0,
                    "total_time": 0,
                    "difficulty": "Easy",
                    "nutritional_info": {"calories": None, "carbs": None, "protein": None, "fat": None, "fiber": None, "sugar": None, "glycemic_index": None},
                    "tags": filters or [],
                    "image_url": "",
                    "servings": 2,
                }
            ]

        def emergency_recipes() -> List[Dict[str, Any]]:
            ingredient_text = ", ".join(ingredients) if ingredients else "available ingredients"
            base = [
                {
                    "title": "Protein Bowl with Greens",
                    "description": f"Diabetes-friendly bowl using {ingredient_text}.",
                    "ingredients": [{"name": ing, "quantity": 1, "unit": "portion"} for ing in ingredients],
                    "instructions": [
                        "Prep and season proteins.",
                        "Sauté greens with olive oil.",
                        "Combine and serve warm.",
                    ],
                    "prep_time": 10,
                    "cook_time": 15,
                    "total_time": 25,
                    "difficulty": "Easy",
                    "nutritional_info": {
                        "calories": 350,
                        "carbs": 15,
                        "protein": 35,
                        "fat": 12,
                        "fiber": 6,
                        "sugar": 3,
                        "glycemic_index": "Low",
                    },
                    "tags": ["diabetes-friendly", "high-protein", "low-carb"],
                    "servings": 2,
                },
                {
                    "title": "Baked Herb Fish & Spinach",
                    "description": f"Light fish entrée featuring {ingredient_text}.",
                    "ingredients": [{"name": ing, "quantity": 1, "unit": "portion"} for ing in ingredients],
                    "instructions": [
                        "Bake fish with herbs and lemon.",
                        "Wilt spinach with garlic.",
                        "Plate together with olive oil drizzle.",
                    ],
                    "prep_time": 8,
                    "cook_time": 18,
                    "total_time": 26,
                    "difficulty": "Easy",
                    "nutritional_info": {
                        "calories": 280,
                        "carbs": 10,
                        "protein": 32,
                        "fat": 9,
                        "fiber": 5,
                        "sugar": 2,
                        "glycemic_index": "Low",
                    },
                    "tags": ["diabetes-friendly", "low-carb", "omega-3"],
                    "servings": 2,
                },
                {
                    "title": "Chicken & Veg Skillet",
                    "description": f"One-pan meal with {ingredient_text}.",
                    "ingredients": [{"name": ing, "quantity": 1, "unit": "portion"} for ing in ingredients],
                    "instructions": [
                        "Sear chicken until browned.",
                        "Add vegetables and cook until tender.",
                        "Finish with herbs and serve.",
                    ],
                    "prep_time": 12,
                    "cook_time": 18,
                    "total_time": 30,
                    "difficulty": "Easy",
                    "nutritional_info": {
                        "calories": 360,
                        "carbs": 18,
                        "protein": 34,
                        "fat": 14,
                        "fiber": 7,
                        "sugar": 3,
                        "glycemic_index": "Medium",
                    },
                    "tags": ["diabetes-friendly", "balanced", "high-protein"],
                    "servings": 2,
                },
            ]
            return base

        if not self.enabled:
            fallback = emergency_recipes()
            self._attach_images(fallback, tier, ingredients)
            return fallback

        # Iterate through model chain with provider-specific clients
        for model in model_chain:
            use_fallback = "deepseek" in model.lower()
            client = self.fallback_client if use_fallback else self.primary_client
            if not client:
                continue
            try:
                content = self._call(client, model, ingredients, filters)
                recipes = parse_content(content)
                if recipes:
                    self._attach_images(recipes, tier, ingredients)
                    return recipes[:3]
            except OpenAIError as exc:
                logger.warning("Model %s failed, trying next: %s", model, exc)
                continue

        fallback = emergency_recipes()
        self._attach_images(fallback, tier, ingredients)
        return fallback
