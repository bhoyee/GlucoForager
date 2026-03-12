import logging
import logging
import hashlib
import io
import re
from pathlib import Path
from typing import Any, Dict, List, Sequence

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

    def _call(
        self,
        client: OpenAI,
        model: str,
        ingredients: List[str],
        filters: List[str],
        *,
        extra_instructions: str | None = None,
        temperature: float = 0.4,
    ) -> str:
        # Avoid KeyError from braces in the JSON template; replace only the {ingredients} token.
        prompt = OPENAI_PROMPT.replace("{ingredients}", ", ".join(ingredients))
        if filters:
            prompt += f"\nApply dietary filters: {', '.join(filters)}."
        if extra_instructions:
            prompt += f"\n\n{extra_instructions.strip()}"
        params = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a diabetes-safe recipe generator."},
                {"role": "user", "content": prompt},
            ],
            "temperature": float(temperature),
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

        if not self.gemini_api_key:
            return {"image_url": self._placeholder_image(recipe), "image_source": "placeholder"}

        image_bytes = self._generate_image_gemini(prompt, size=size)
        image_url = self._store_generated_image(image_bytes, recipe, size=size)
        return {"image_url": image_url, "image_source": "ai"}

    def _build_image_prompt(self, recipe: Dict[str, Any], ingredients: List[str]) -> str:
        title = (recipe.get("title") or recipe.get("name") or "").strip()
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
            "Create a real-looking food photograph of the finished dish (not an illustration, not CGI, not 3D).",
            "Look like a real photo taken with a modern smartphone or DSLR in natural lighting.",
            "Square 1:1 composition, centered plating, clean simple background, high detail, realistic textures.",
            "Include subtle, natural imperfections (not overly polished) so it does not look AI-generated.",
            "Avoid common AI artifacts: plastic/glossy textures, over-saturated colors, unnatural bokeh, warped cutlery, smeared details.",
            "IMPORTANT: Absolutely no text of any kind (no letters, numbers, titles, captions, labels, watermarks, logos, UI).",
            "Do not generate menus, recipe cards, app screens, packaging, or any overlay text.",
            "No borders, no frames, no top banners, no UI elements — the image must be an edge-to-edge food photo only.",
        ]
        # Avoid including structured labels like "Recipe name:" / "Ingredients:" which increases the chance
        # the model will generate a recipe-card image with text overlays.
        if ingredient_text:
            parts.append(f"The dish is made from {ingredient_text}.")
        elif title:
            parts.append("The dish matches the recipe title concept, but do not write any words in the image.")
        parts.append("The dish should look diabetes-friendly (balanced plate, not overly sugary).")
        return " ".join(parts)

    def _generate_image_gemini(self, prompt: str, *, size: int) -> bytes:
        """
        Generate an image using Google's GenAI API (Imagen or Gemini image models).

        Notes:
        - Some Google API keys/projects do not have access to Imagen. In that case, use a Gemini
          image-capable model and the generate_content flow.
        - We always store/rescale to the requested `size` (512 by default) even if the provider
          returns a larger image.
        """

        try:
            from google import genai  # type: ignore[import-not-found]
            from google.genai import types  # type: ignore[import-not-found]
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("google-genai is not installed; cannot generate images") from exc

        model = (self.gemini_image_model or "").strip()
        if not model:
            raise RuntimeError("GEMINI_IMAGE_MODEL is not set")

        client = genai.Client(api_key=str(self.gemini_api_key))

        # Imagen path (official "generate_images" API).
        if model.startswith("imagen-"):
            try:
                resp = client.models.generate_images(
                    model=model,
                    prompt=prompt,
                    config=types.GenerateImagesConfig(
                        number_of_images=1,
                        aspect_ratio="1:1",
                        output_mime_type="image/jpeg",
                    ),
                )
                generated = getattr(resp, "generated_images", None) or []
                if not generated:
                    raise RuntimeError("Imagen response missing generated_images")
                img_obj = generated[0].image
                # google-genai image object commonly provides raw bytes; fall back to PIL conversion.
                image_bytes = getattr(img_obj, "image_bytes", None) or getattr(img_obj, "data", None)
                if isinstance(image_bytes, (bytes, bytearray)) and image_bytes:
                    return bytes(image_bytes)
                try:
                    pil_img = img_obj.to_pil()  # type: ignore[attr-defined]
                except Exception:  # noqa: BLE001
                    pil_img = None
                if pil_img is not None:
                    buf = io.BytesIO()
                    pil_img.save(buf, format="JPEG", quality=90)
                    return buf.getvalue()
                raise RuntimeError("Imagen returned image without bytes")
            except Exception as exc:  # noqa: BLE001
                # Fall back to Gemini image generation if available.
                logger.warning("Imagen generate_images failed (model=%s): %s", model, str(exc)[:400])

        # Gemini image-capable models path via generate_content.
        # For example: gemini-3-pro-image-preview (if available) or whatever your project supports.
        try:
            resp = client.models.generate_content(
                model=model,
                contents=[prompt],
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                ),
            )
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Gemini generate_content failed for model '{model}'") from exc

        candidates = getattr(resp, "candidates", None) or []
        if not candidates:
            raise RuntimeError("Gemini response missing candidates")
        content = getattr(candidates[0], "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            inline = getattr(part, "inline_data", None)
            if inline is None:
                continue
            data = getattr(inline, "data", None)
            if isinstance(data, (bytes, bytearray)) and data:
                return bytes(data)
        raise RuntimeError("Gemini response did not include inline image data")

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
        exclude_titles: Sequence[str] | None = None,
        variety_mode: bool = False,
        generate_images: bool = True,
    ) -> List[Dict[str, Any]]:
        filters = filters or []
        exclude_titles = [str(t).strip() for t in (exclude_titles or []) if str(t).strip()]
        from ..core.constants import TIER_CONFIG  # local import to avoid cycle
        tier_cfg = TIER_CONFIG.get(tier, {})
        model_chain: List[str] = tier_cfg.get("recipe_models") or [self.primary_model]

        banned_titles_norm = {self._normalize_title(t) for t in exclude_titles if t}
        extra_instructions = None
        if exclude_titles or variety_mode:
            parts = [
                "Important: provide 3 distinct diabetes-friendly recipes.",
                "Make them meaningfully different (different cuisines and cooking methods; avoid near-duplicates).",
            ]
            if exclude_titles:
                joined = "; ".join(exclude_titles[:12])
                parts.append(f"Do NOT suggest recipes with titles matching or similar to: {joined}.")
            extra_instructions = " ".join(parts)

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
                temperature = 0.7 if variety_mode else 0.4
                content = self._call(
                    client,
                    model,
                    ingredients,
                    filters,
                    extra_instructions=extra_instructions,
                    temperature=temperature,
                )
                recipes = parse_content(content)
                recipes = self._filter_recipes(recipes, banned_titles_norm)
                if recipes:
                    # If we asked for variety but still got duplicates/overlaps, retry once with stricter wording.
                    if (exclude_titles or variety_mode) and len(recipes) < 3:
                        stricter = (extra_instructions or "") + " You must comply. Return 3 NEW recipes."
                        content2 = self._call(
                            client,
                            model,
                            ingredients,
                            filters,
                            extra_instructions=stricter,
                            temperature=0.8,
                        )
                        recipes2 = self._filter_recipes(parse_content(content2), banned_titles_norm)
                        if recipes2:
                            recipes = recipes2
                    recipes = recipes[:3]
                    if generate_images:
                        self._attach_images(recipes, tier, ingredients)
                    else:
                        self._attach_placeholders(recipes)
                    return recipes
            except OpenAIError as exc:
                logger.warning("Model %s failed, trying next: %s", model, exc)
                continue

        fallback = emergency_recipes()
        if generate_images:
            self._attach_images(fallback, tier, ingredients)
        else:
            self._attach_placeholders(fallback)
        return fallback

    def _normalize_title(self, title: str) -> str:
        value = (title or "").strip().lower()
        if not value:
            return ""
        # Keep alnum only to improve "similar" matching for minor punctuation differences.
        return re.sub(r"[^a-z0-9]+", " ", value).strip()

    def _filter_recipes(
        self,
        recipes: List[Dict[str, Any]],
        banned_titles_norm: set[str],
    ) -> List[Dict[str, Any]]:
        if not recipes:
            return recipes
        out: List[Dict[str, Any]] = []
        seen: set[str] = set()
        for recipe in recipes:
            if not isinstance(recipe, dict):
                continue
            title = (recipe.get("title") or recipe.get("name") or "").strip()
            norm = self._normalize_title(title)
            if not norm:
                continue
            if norm in seen:
                continue
            if norm in banned_titles_norm:
                continue
            out.append(recipe)
            seen.add(norm)
            if len(out) >= 3:
                break
        return out
