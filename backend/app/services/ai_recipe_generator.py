import logging
import logging
import hashlib
import io
import random
import re
import time
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
        self.primary_client = (
            OpenAI(
                api_key=settings.openai_api_key,
                organization=settings.openai_organization,
                # Avoid long compounded delays from retries on slow networks; we handle fallbacks ourselves.
                max_retries=0,
            )
            if settings.openai_api_key
            else None
        )
        self.primary_model = settings.openai_model
        self.image_model = "dall-e-3"
        # DeepSeek fallback for text (vision not supported)
        self.fallback_client = (
            OpenAI(api_key=settings.deepseek_api_key, base_url=settings.deepseek_base_url, max_retries=0)
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
        timeout_seconds: float | None = None,
    ) -> str:
        # Avoid KeyError from braces in the JSON template; replace only the {ingredients} token.
        base_prompt = OPENAI_PROMPT
        if not ingredients:
            base_prompt = OPENAI_PROMPT.replace(
                "Create 3 diabetic-friendly recipes using ONLY: {ingredients}.",
                "Create 3 diabetic-friendly recipes with common, easy-to-find ingredients. "
                "Do not assume the user has any specific ingredients.",
            )
        prompt = base_prompt.replace("{ingredients}", ", ".join(ingredients))
        if filters:
            prompt += f"\nApply dietary filters: {', '.join(filters)}."
        if extra_instructions:
            prompt += f"\n\n{extra_instructions.strip()}"
        params = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a diabetes-safe recipe generator. "
                        "Respond with a single valid JSON object and no other text."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": float(temperature),
        }
        # Some newer models use max_completion_tokens instead of max_tokens
        if model.startswith("gpt-5"):
            params["max_completion_tokens"] = 2000
        else:
            params["max_tokens"] = 2000
        # Prefer strict JSON mode where supported (OpenAI supports this; some OpenAI-compatible providers may not).
        params_json = {**params, "response_format": {"type": "json_object"}}
        try:
            resp = client.chat.completions.create(**params_json, timeout=timeout_seconds)
        except OpenAIError as exc:
            # If the provider rejects response_format, retry without it.
            msg = str(exc).lower()
            if "response_format" not in msg and "unknown parameter" not in msg and "unexpected" not in msg:
                raise
            resp = client.chat.completions.create(**params, timeout=timeout_seconds)
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
        mode: str | None = None,
        timeout_seconds: float | None = None,
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

        mode_norm = (mode or "").strip().lower()
        if mode_norm in ("surprise", "quick"):
            fast_chain = tier_cfg.get("recipe_models_fast") or []
            if isinstance(fast_chain, list) and fast_chain:
                model_chain = [str(m) for m in fast_chain if str(m).strip()]
            # For "Eat now" modes, prioritize whichever provider is actually configured/reachable.
            # If DeepSeek is configured, try it first so OpenAI timeouts don't consume the whole budget.
            if self.fallback_client:
                deepseek_models = [m for m in model_chain if "deepseek" in m.lower()]
                other_models = [m for m in model_chain if "deepseek" not in m.lower()]
                if deepseek_models:
                    model_chain = [*deepseek_models, *other_models]

        if mode_norm in ("surprise", "quick"):
            cuisine_sets = [
                ("Mediterranean", "Mexican-inspired", "Asian-inspired"),
                ("West African-inspired", "Indian-inspired", "American comfort (healthy)"),
                ("Middle Eastern-inspired", "Italian-inspired (low-carb)", "Caribbean-inspired"),
            ]
            cuisines = random.choice(cuisine_sets)
            mode_parts = [
                f"Theme the three recipes across these cuisines: {', '.join(cuisines)}.",
                "Ensure all three recipes are clearly different from each other (protein + method + flavor).",
                f"Variation token: {random.randint(1000, 9999)}.",
                "Instructions must be beginner-friendly: write 8-12 steps per recipe. Each step should include at least one concrete detail (time in minutes, heat level, visual cue, or exact action). Avoid vague steps like 'cook until done' without guidance.",
            ]
            if mode_norm == "quick":
                mode_parts.extend(
                    [
                        "All recipes must have total_time <= 20 minutes.",
                        "Prefer no-oven methods (skillet, salad, quick saute) and minimal steps.",
                    ]
                )
            else:
                mode_parts.extend(
                    [
                        "Aim for total_time <= 30 minutes.",
                        "Use common, easy-to-find ingredients; avoid repeating the same main dish style.",
                    ]
                )
            extra_instructions = f"{(extra_instructions or '').strip()} {' '.join(mode_parts)}".strip()

        def parse_content(raw: str) -> List[Dict[str, Any]]:
            import json, re

            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```[a-zA-Z]*", "", cleaned)
                cleaned = cleaned.strip("`").strip()
            try:
                data = json.loads(cleaned)
            except Exception:
                # Some providers still wrap JSON with text. Try to extract a JSON object/array substring.
                start = cleaned.find("{")
                end = cleaned.rfind("}")
                if start != -1 and end != -1 and end > start:
                    try:
                        data = json.loads(cleaned[start : end + 1])
                    except Exception:
                        data = None
                else:
                    start = cleaned.find("[")
                    end = cleaned.rfind("]")
                    if start != -1 and end != -1 and end > start:
                        try:
                            data = json.loads(cleaned[start : end + 1])
                        except Exception:
                            data = None
                    else:
                        data = None

            def _num(value: Any) -> int:
                try:
                    if value is None:
                        return 0
                    if isinstance(value, (int, float)):
                        return int(round(float(value)))
                    if isinstance(value, str):
                        cleaned_v = value.strip().replace(",", "")
                        match = re.search(r"-?\d+(?:\.\d+)?", cleaned_v)
                        if match:
                            return int(round(float(match.group(0))))
                        return 0
                    return int(round(float(value)))
                except Exception:  # noqa: BLE001
                    return 0

            def _coerce_steps(value: Any) -> list[str]:
                if isinstance(value, list):
                    out: list[str] = []
                    for item in value:
                        if isinstance(item, str):
                            text = item.strip()
                            if text:
                                out.append(text)
                            continue
                        if isinstance(item, dict):
                            text = (item.get("text") or item.get("step") or item.get("instruction") or "").strip()
                            if text:
                                out.append(text)
                    return out
                if isinstance(value, str):
                    return [line.strip() for line in value.split("\n") if line.strip()]
                return []

            try:
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
                            "calories": _num(ni_src.get("calories")),
                            "carbs": _num(ni_src.get("carbs")),
                            "protein": _num(ni_src.get("protein")),
                            "fat": _num(ni_src.get("fat")),
                            "fiber": _num(ni_src.get("fiber")),
                            "sugar": _num(ni_src.get("sugar")),
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
                        item["instructions"] = _coerce_steps(item.get("instructions") or item.get("steps") or [])
                        item.setdefault("tips", item.get("tips") or [])
                        item.setdefault("ingredients", item.get("ingredients") or [])
                        prep_n = _num(item.get("prep_time") or item.get("prepTime"))
                        cook_n = _num(item.get("cook_time") or item.get("cookTime"))
                        total_n = _num(item.get("total_time") or item.get("totalTime") or item.get("time")) or (
                            prep_n + cook_n
                        )
                        item["prep_time"] = prep_n
                        item["cook_time"] = cook_n
                        item["total_time"] = total_n
                        item.setdefault("difficulty", item.get("difficulty") or "Easy")
                        item.setdefault("tags", item.get("tags") or [])
                        item.setdefault("servings", _num(item.get("servings")) or 2)
                        normalized.append(item)
                    if normalized:
                        return normalized
            except Exception:
                pass
            return []

        def emergency_recipes() -> List[Dict[str, Any]]:
            is_quick = mode_norm == "quick"
            # If we ever hit emergency fallback for Surprise/Quick, avoid returning the same 3 recipes forever.
            # This is only used when AI calls fail, so a little variety matters for UX.
            if not ingredients and is_quick:
                variation = random.randint(1000, 9999)
                return [
                    {
                        "title": f"10-Min Egg & Spinach Scramble ({variation})",
                        "description": "Fast, diabetes-friendly, high-protein breakfast or light meal.",
                        "ingredients": [
                            {"name": "eggs", "quantity": 2, "unit": "large"},
                            {"name": "spinach", "quantity": 2, "unit": "cups"},
                            {"name": "olive oil", "quantity": 1, "unit": "tsp"},
                            {"name": "garlic", "quantity": 1, "unit": "clove"},
                        ],
                        "instructions": [
                            "Wash spinach and mince garlic.",
                            "Heat a nonstick skillet over medium heat for 30 seconds; add olive oil.",
                            "Add garlic; cook 20-30 seconds until fragrant (don’t brown).",
                            "Add spinach; saute 1-2 minutes until wilted.",
                            "Whisk eggs with a pinch of salt and pepper; pour into the pan.",
                            "Stir gently 2-3 minutes until just set; remove from heat and serve.",
                        ],
                        "prep_time": 3,
                        "cook_time": 7,
                        "total_time": 10,
                        "difficulty": "Easy",
                        "nutritional_info": {
                            "calories": 320,
                            "carbs": 8,
                            "protein": 26,
                            "fat": 20,
                            "fiber": 5,
                            "sugar": 2,
                            "glycemic_index": "Low",
                        },
                        "tags": ["diabetes-friendly", "low-carb", "high-protein", "quick"],
                        "servings": 1,
                    },
                    {
                        "title": "Tuna Avocado Salad Cups",
                        "description": "No-cook, low-carb lunch that’s filling and quick to assemble.",
                        "ingredients": [
                            {"name": "canned tuna", "quantity": 1, "unit": "can"},
                            {"name": "avocado", "quantity": 0.5, "unit": "whole"},
                            {"name": "lemon", "quantity": 1, "unit": "tbsp juice"},
                            {"name": "olive oil", "quantity": 1, "unit": "tsp"},
                            {"name": "lettuce", "quantity": 4, "unit": "leaves"},
                        ],
                        "instructions": [
                            "Drain tuna well; mash avocado with lemon juice in a bowl.",
                            "Mix tuna into avocado; add olive oil, salt, and pepper to taste.",
                            "Spoon mixture into lettuce leaves.",
                            "Finish with extra lemon or chili flakes if desired; serve immediately.",
                        ],
                        "prep_time": 8,
                        "cook_time": 0,
                        "total_time": 8,
                        "difficulty": "Easy",
                        "nutritional_info": {
                            "calories": 360,
                            "carbs": 10,
                            "protein": 32,
                            "fat": 22,
                            "fiber": 7,
                            "sugar": 2,
                            "glycemic_index": "Low",
                        },
                        "tags": ["diabetes-friendly", "low-carb", "high-protein", "quick"],
                        "servings": 1,
                    },
                    {
                        "title": "Greek Yogurt Chia Bowl",
                        "description": "Quick, fiber-boosted snack or breakfast that supports steadier energy.",
                        "ingredients": [
                            {"name": "plain Greek yogurt", "quantity": 1, "unit": "cup"},
                            {"name": "chia seeds", "quantity": 1, "unit": "tbsp"},
                            {"name": "cinnamon", "quantity": 0.5, "unit": "tsp"},
                            {"name": "berries", "quantity": 0.25, "unit": "cup"},
                        ],
                        "instructions": [
                            "Stir chia seeds and cinnamon into Greek yogurt until well combined.",
                            "Top with berries (keep portion small).",
                            "Let sit 3-5 minutes to thicken, then eat.",
                        ],
                        "prep_time": 5,
                        "cook_time": 0,
                        "total_time": 5,
                        "difficulty": "Easy",
                        "nutritional_info": {
                            "calories": 260,
                            "carbs": 18,
                            "protein": 25,
                            "fat": 8,
                            "fiber": 7,
                            "sugar": 8,
                            "glycemic_index": "Low",
                        },
                        "tags": ["diabetes-friendly", "high-protein", "high-fiber", "quick"],
                        "servings": 1,
                    },
                ]

            if ingredients:
                base_ingredients = ingredients
            else:
                protein_pool = ["chicken breast", "salmon", "tuna", "eggs", "tofu", "turkey"]
                veg_pool = ["spinach", "broccoli", "zucchini", "cauliflower", "mushrooms", "bell pepper", "tomatoes"]
                flavor_pool = ["lemon", "garlic", "cumin", "chili flakes", "black pepper", "paprika"]
                protein = random.choice(protein_pool)
                vegs = random.sample(veg_pool, k=2)
                flavors = random.sample(flavor_pool, k=2)
                base_ingredients = [protein, *vegs, "olive oil", *flavors]

            ingredient_text = ", ".join(base_ingredients) if base_ingredients else "common ingredients"
            main = (base_ingredients[0] if base_ingredients else "protein").strip()
            t1 = 18 if is_quick else 25
            t2 = 19 if is_quick else 26
            t3 = 20 if is_quick else 30
            base = [
                {
                    "title": f"{main.title()} Bowl with Greens",
                    "description": f"Diabetes-friendly bowl using {ingredient_text}.",
                    "ingredients": [{"name": ing, "quantity": 1, "unit": "portion"} for ing in base_ingredients],
                    "instructions": [
                        "Prep: pat protein dry; season with salt/pepper (and lemon zest if available).",
                        "Heat a skillet over medium-high heat for 1 minute; add a small drizzle of olive oil.",
                        "Cook protein 4-6 minutes total, flipping once, until browned and cooked through.",
                        "In the same pan, add garlic and greens; saute 2-3 minutes until wilted.",
                        "Add broccoli (fresh or steamed) and toss 1 minute to warm through.",
                        "Plate and finish with lemon juice and a light olive-oil drizzle.",
                    ],
                    "prep_time": 10,
                    "cook_time": max(0, t1 - 10),
                    "total_time": t1,
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
                    "title": f"Herb {main.title()} & Greens",
                    "description": f"Light fish entrée featuring {ingredient_text}.",
                    "ingredients": [{"name": ing, "quantity": 1, "unit": "portion"} for ing in base_ingredients],
                    "instructions": [
                        "Prep: season the protein with salt/pepper, lemon, and herbs/spices.",
                        "Cook protein 8-12 minutes until done (or pan-sear 3-4 minutes per side, depending on thickness).",
                        "Meanwhile, heat a skillet over medium heat; add olive oil and garlic for 30 seconds.",
                        "Add spinach; saute 2-3 minutes until just wilted.",
                        "Plate protein over spinach; squeeze lemon on top and taste for salt.",
                        "Serve with steamed broccoli for extra fiber.",
                    ],
                    "prep_time": 8,
                    "cook_time": max(0, t2 - 8),
                    "total_time": t2,
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
                    "title": f"{main.title()} & Veg Skillet",
                    "description": f"One-pan meal with {ingredient_text}.",
                    "ingredients": [{"name": ing, "quantity": 1, "unit": "portion"} for ing in base_ingredients],
                    "instructions": [
                        "Prep: cut the protein into bite-size pieces (if needed) and season well.",
                        "Heat skillet over medium-high heat; add olive oil.",
                        "Sear protein 5-7 minutes, stirring occasionally, until browned and cooked through.",
                        "Add vegetables; saute 6-8 minutes until tender-crisp.",
                        "Add garlic and cook 30 seconds until fragrant.",
                        "Finish with lemon and serve immediately.",
                    ],
                    "prep_time": 12,
                    "cook_time": max(0, t3 - 12),
                    "total_time": t3,
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
            if settings.ai_disable_emergency_fallback:
                raise RuntimeError("AI is not configured (missing OPENAI_API_KEY/DEEPSEEK_API_KEY).")
            fallback = emergency_recipes()
            for recipe in fallback:
                if isinstance(recipe, dict):
                    recipe["_ai_provider"] = "fallback"
                    recipe["_ai_model"] = "emergency_recipes"
            if generate_images:
                self._attach_images(fallback, tier, ingredients)
            else:
                self._attach_placeholders(fallback)
            return fallback

        started = time.time()
        budget = float(timeout_seconds) if timeout_seconds else None
        attempts: list[dict[str, Any]] = []

        # Iterate through model chain with provider-specific clients
        for model in model_chain:
            if budget is not None:
                remaining = budget - (time.time() - started)
                if remaining <= 2:
                    break
            use_fallback = "deepseek" in model.lower()
            client = self.fallback_client if use_fallback else self.primary_client
            if not client:
                attempts.append({"model": model, "provider": "deepseek" if use_fallback else "openai", "error": "client_not_configured"})
                continue
            try:
                temperature = 0.85 if mode_norm in ("surprise", "quick") else (0.7 if variety_mode else 0.4)
                per_request_timeout = None
                if budget is not None:
                    remaining = budget - (time.time() - started)
                    # Ensure we have time to actually reach the fallback provider.
                    if mode_norm in ("surprise", "quick"):
                        cap = 22.0 if (not use_fallback) else 28.0
                    else:
                        cap = 25.0
                    per_request_timeout = max(5.0, min(cap, remaining))
                content = self._call(
                    client,
                    model,
                    ingredients,
                    filters,
                    extra_instructions=extra_instructions,
                    temperature=temperature,
                    timeout_seconds=per_request_timeout,
                )
                recipes = parse_content(content)
                recipes = self._filter_recipes(recipes, banned_titles_norm)
                if recipes:
                    # If we asked for variety but still got duplicates/overlaps, retry once with stricter wording.
                    if (exclude_titles or variety_mode) and len(recipes) < 3:
                        stricter = (extra_instructions or "") + " You must comply. Return 3 NEW recipes."
                        per_request_timeout2 = per_request_timeout
                        if budget is not None:
                            remaining = budget - (time.time() - started)
                            per_request_timeout2 = max(5.0, min(25.0, remaining))
                        content2 = self._call(
                            client,
                            model,
                            ingredients,
                            filters,
                            extra_instructions=stricter,
                            temperature=0.8,
                            timeout_seconds=per_request_timeout2,
                        )
                        recipes2 = self._filter_recipes(parse_content(content2), banned_titles_norm)
                        if recipes2:
                            recipes = recipes2
                    recipes = recipes[:3]
                    for recipe in recipes:
                        if isinstance(recipe, dict):
                            recipe["_ai_provider"] = "deepseek" if use_fallback else "openai"
                            recipe["_ai_model"] = model
                    if generate_images:
                        self._attach_images(recipes, tier, ingredients)
                    else:
                        self._attach_placeholders(recipes)
                    return recipes
                attempts.append(
                    {
                        "model": model,
                        "provider": "deepseek" if use_fallback else "openai",
                        "error": "empty_or_unparseable_json",
                    }
                )
            except OpenAIError as exc:
                logger.warning("Model %s failed, trying next: %s", model, exc)
                attempts.append(
                    {
                        "model": model,
                        "provider": "deepseek" if use_fallback else "openai",
                        "error": str(exc),
                    }
                )
                continue

        fallback = emergency_recipes()
        if settings.ai_disable_emergency_fallback:
            raise RuntimeError(
                "All AI models failed or returned invalid output. "
                "Emergency fallback is disabled (AI_DISABLE_EMERGENCY_FALLBACK=true)."
            )
        for recipe in fallback:
            if isinstance(recipe, dict):
                recipe["_ai_provider"] = "fallback"
                recipe["_ai_model"] = "emergency_recipes"
        if attempts:
            logger.warning(
                "All AI models failed or returned invalid output (mode=%s tier=%s). Using emergency recipes. attempts=%s",
                mode_norm or "ingredients",
                tier,
                attempts,
            )
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
