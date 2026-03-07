import logging
import logging
import hashlib
import io
from pathlib import Path
from typing import Any, Dict, List

import httpx
from openai import OpenAI, OpenAIError
from PIL import Image

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
        self.gemini_api_key = settings.gemini_api_key
        self.gemini_image_model = settings.gemini_image_model

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
        # Single, consistent placeholder image for all AI recipes.
        return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80"

    def _image_cache_key(self, recipe: Dict[str, Any]) -> str:
        title = recipe.get("title") or recipe.get("name") or ""
        desc = recipe.get("description") or ""
        return f"img:{hashlib.sha256((title + desc).encode()).hexdigest()}"

    def _attach_images(self, recipes: List[Dict[str, Any]], tier: str, ingredients: List[str]) -> None:
        """Always attach placeholders (AI images disabled)."""
        self._attach_placeholders(recipes)

    def _attach_placeholders(self, recipes: List[Dict[str, Any]]) -> None:
        if not recipes:
            return
        for recipe in recipes:
            if not recipe.get("image_url"):
                recipe["image_url"] = self._placeholder_image(recipe)
                recipe["image_source"] = "placeholder"

    def generate_image_for_recipe(
        self,
        recipe: Dict[str, Any],
        tier: str,
        ingredients: List[str] | None = None,
        *,
        size: int = 512,
    ) -> Dict[str, Any]:
        if not recipe:
            return {"image_url": None, "image_source": "none"}

        prompt = self._build_image_prompt(recipe, ingredients or [])

        try:
            if self.gemini_api_key:
                image_bytes = self._generate_image_gemini(prompt)
                image_url = self._store_generated_image(image_bytes, recipe, size=size)
                return {"image_url": image_url, "image_source": "ai"}
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini image generation failed: %s", exc)

        return {"image_url": self._placeholder_image(recipe), "image_source": "placeholder"}

    def _build_image_prompt(self, recipe: Dict[str, Any], ingredients: List[str]) -> str:
        title = (recipe.get("title") or recipe.get("name") or "").strip()
        desc = (recipe.get("description") or "").strip()
        raw_items = recipe.get("ingredients") or []
        normalized = []
        for item in raw_items:
            if isinstance(item, dict):
                name = (item.get("name") or "").strip()
                if name:
                    normalized.append(name)
            elif isinstance(item, str) and item.strip():
                normalized.append(item.strip())
        if ingredients:
            normalized = list(dict.fromkeys([*ingredients, *normalized]))
        ingredient_text = ", ".join(normalized[:16]) if normalized else ""

        parts = [
            "Create a professional, appetizing, photorealistic food image for a recipe in a mobile app.",
            "No text, no watermarks, no logos, no labels, no utensils brand names.",
            "Square composition, centered plating, clean background, natural lighting, high detail.",
        ]
        if title:
            parts.append(f"Recipe name: {title}.")
        if desc:
            parts.append(f"Description: {desc}")
        if ingredient_text:
            parts.append(f"Key ingredients: {ingredient_text}.")
        parts.append("The dish should look diabetes-friendly (balanced plate, not overly sugary).")
        return " ".join(parts)

    def _generate_image_gemini(self, prompt: str) -> bytes:
        url = "https://generativelanguage.googleapis.com/v1beta/openai/images/generations"
        headers = {
            "Authorization": f"Bearer {self.gemini_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.gemini_image_model,
            "prompt": prompt,
            "response_format": "b64_json",
            "n": 1,
        }
        with httpx.Client(timeout=60) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        items = data.get("data") or []
        if not items or not isinstance(items, list):
            raise ValueError("Gemini image response missing data")

        b64_json = items[0].get("b64_json")
        if not b64_json:
            raise ValueError("Gemini image response missing b64_json")

        import base64

        return base64.b64decode(b64_json)

    def _store_generated_image(self, image_bytes: bytes, recipe: Dict[str, Any], *, size: int) -> str:
        digest = self._image_cache_key(recipe).replace("img:", "")
        folder = Path(settings.uploads_dir) / "recipe-images"
        folder.mkdir(parents=True, exist_ok=True)
        filename = f"{digest}-{int(size)}.jpg"
        path = folder / filename

        img = Image.open(io.BytesIO(image_bytes))
        img = img.convert("RGB")
        target = 512 if int(size) not in (512, 768, 1024) else int(size)
        if img.size[0] != target or img.size[1] != target:
            img = img.resize((target, target), Image.Resampling.LANCZOS)
        img.save(path, format="JPEG", quality=82, optimize=True, progressive=True)

        base = (settings.site_url or "").rstrip("/")
        if base:
            return f"{base}/uploads/recipe-images/{filename}"
        return f"/uploads/recipe-images/{filename}"

    def generate(
        self,
        ingredients: List[str],
        tier: str,
        filters: List[str] | None = None,
        generate_images: bool = True,
    ) -> List[Dict[str, Any]]:
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
                        item.setdefault("tips", item.get("tips") or [])
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
            if generate_images:
                self._attach_images(fallback, tier, ingredients)
            else:
                self._attach_placeholders(fallback)
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
                    if generate_images:
                        self._attach_images(recipes, tier, ingredients)
                    else:
                        self._attach_placeholders(recipes)
                    return recipes[:3]
            except OpenAIError as exc:
                logger.warning("Model %s failed, trying next: %s", model, exc)
                continue

        fallback = emergency_recipes()
        if generate_images:
            self._attach_images(fallback, tier, ingredients)
        else:
            self._attach_placeholders(fallback)
        return fallback
