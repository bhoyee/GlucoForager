import logging
import hashlib
import io
import random
import re
import time
import uuid
import base64
from pathlib import Path
from typing import Any, Dict, List, Sequence

import httpx
from openai import OpenAI, OpenAIError
from PIL import Image

from ..core.config import settings
from ..core.constants import EAT_NOW_PROMPT, OPENAI_PROMPT
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
        self.gemini_text_model = (settings.gemini_text_model or "").strip() or None
        self.recipe_image_provider = (settings.recipe_image_provider or "").strip().lower() or "gemini"
        self.runware_api_key = settings.runware_api_key
        self.runware_api_url = (settings.runware_api_url or "").strip().rstrip("/")
        self.runware_image_model = (settings.runware_image_model or "").strip() or "runware:100@1"

    def _call_gemini_text(
        self,
        model: str,
        ingredients: List[str],
        filters: List[str],
        *,
        prompt_template: str | None = None,
        extra_instructions: str | None = None,
        temperature: float = 0.4,
        timeout_seconds: float | None = None,
        max_output_tokens: int = 2000,
    ) -> str:
        if not self.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not set")
        if not model:
            raise RuntimeError("GEMINI_TEXT_MODEL is not set")

        # Build the same JSON-only prompt we use for OpenAI, but without response_format support.
        base_prompt = prompt_template or OPENAI_PROMPT
        if (not ingredients) and ("{ingredients}" in base_prompt):
            base_prompt = OPENAI_PROMPT.replace(
                "Create 3 diabetic-friendly recipes using ONLY: {ingredients}.",
                "Create 3 diabetic-friendly recipes with common, easy-to-find ingredients. "
                "Do not assume the user has any specific ingredients.",
            )
        prompt = base_prompt
        if "{ingredients}" in prompt:
            prompt = prompt.replace("{ingredients}", ", ".join(ingredients))
        if filters:
            prompt += f"\nApply dietary filters: {', '.join(filters)}."
        if extra_instructions:
            prompt += f"\n\n{extra_instructions.strip()}"
        # Gemini models can be more likely to add prose; reinforce hard constraint.
        prompt = (
            "Return ONLY a single valid JSON object. No markdown, no code fences, no commentary.\n\n" + prompt
        )

        try:
            from google import genai  # type: ignore[import-not-found]
            from google.genai import types  # type: ignore[import-not-found]
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("google-genai is not installed; cannot use Gemini text fallback") from exc

        client = genai.Client(api_key=str(self.gemini_api_key))

        started = time.time()
        try:
            kwargs: dict[str, Any] = {
                "model": model,
                "contents": [prompt],
                "config": types.GenerateContentConfig(
                    temperature=float(temperature),
                    max_output_tokens=int(max_output_tokens),
                ),
            }
            # google-genai has had API surface changes; only pass `timeout` if supported.
            if timeout_seconds is not None:
                try:
                    import inspect

                    if "timeout" in inspect.signature(client.models.generate_content).parameters:
                        kwargs["timeout"] = timeout_seconds
                except Exception:
                    # If signature inspection fails, omit timeout rather than crashing.
                    pass
            resp = client.models.generate_content(**kwargs)
        finally:
            if settings.ai_debug_logging:
                elapsed = time.time() - started
                logger.info(
                    "AI call finished provider=gemini model=%s timeout=%s elapsed=%.3fs",
                    model,
                    timeout_seconds,
                    elapsed,
                )

        # Prefer aggregating all candidate parts rather than using `resp.text` directly.
        # In practice `resp.text` can be incomplete depending on SDK version / response shape.
        candidates = getattr(resp, "candidates", None) or []
        if settings.ai_debug_logging and not candidates:
            logger.info("Gemini returned empty response (no candidates) model=%s", model)
        if candidates:
            texts: list[str] = []
            for cand in candidates:
                content = getattr(cand, "content", None)
                parts = getattr(content, "parts", None) or []
                for part in parts:
                    part_text = getattr(part, "text", None)
                    if isinstance(part_text, str) and part_text:
                        texts.append(part_text)
            joined = "".join(texts).strip()
            if joined:
                return joined

        text = getattr(resp, "text", None)
        if isinstance(text, str) and text.strip():
            return text
        return ""

    def _call(
        self,
        client: OpenAI,
        model: str,
        ingredients: List[str],
        filters: List[str],
        *,
        prompt_template: str | None = None,
        extra_instructions: str | None = None,
        temperature: float = 0.4,
        timeout_seconds: float | None = None,
        max_output_tokens: int = 2000,
    ) -> str:
        # Avoid KeyError from braces in the JSON template; replace only the {ingredients} token.
        base_prompt = prompt_template or OPENAI_PROMPT
        if (not ingredients) and ("{ingredients}" in base_prompt):
            base_prompt = OPENAI_PROMPT.replace(
                "Create 3 diabetic-friendly recipes using ONLY: {ingredients}.",
                "Create 3 diabetic-friendly recipes with common, easy-to-find ingredients. "
                "Do not assume the user has any specific ingredients.",
            )
        prompt = base_prompt
        if "{ingredients}" in prompt:
            prompt = prompt.replace("{ingredients}", ", ".join(ingredients))
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
            params["max_completion_tokens"] = int(max_output_tokens)
        else:
            params["max_tokens"] = int(max_output_tokens)
        # Prefer strict JSON mode where supported (OpenAI supports this; some OpenAI-compatible providers may not).
        params_json = {**params, "response_format": {"type": "json_object"}}
        try:
            started = time.time()
            resp = client.chat.completions.create(**params_json, timeout=timeout_seconds)
        except OpenAIError as exc:
            # If the provider rejects response_format, retry without it.
            msg = str(exc).lower()
            if "response_format" not in msg and "unknown parameter" not in msg and "unexpected" not in msg:
                raise
            started = time.time()
            resp = client.chat.completions.create(**params, timeout=timeout_seconds)
        finally:
            if settings.ai_debug_logging:
                elapsed = time.time() - started if "started" in locals() else None
                base_url = str(getattr(client, "base_url", "") or "")
                logger.info(
                    "AI call finished model=%s base_url=%s timeout=%s elapsed=%.3fs",
                    model,
                    base_url,
                    timeout_seconds,
                    elapsed or -1.0,
                )
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

        provider = (self.recipe_image_provider or "").strip().lower()
        if provider == "runware":
            if not self.runware_api_key:
                return {"image_url": self._placeholder_image(recipe), "image_source": "placeholder"}
            image_bytes = self._generate_image_runware(prompt, size=size)
        elif provider == "gemini":
            if not self.gemini_api_key:
                return {"image_url": self._placeholder_image(recipe), "image_source": "placeholder"}
            image_bytes = self._generate_image_gemini(prompt, size=size)
        else:
            # Best-effort fallback: prefer Runware if configured, otherwise Gemini, otherwise placeholder.
            if self.runware_api_key:
                image_bytes = self._generate_image_runware(prompt, size=size)
            elif self.gemini_api_key:
                image_bytes = self._generate_image_gemini(prompt, size=size)
            else:
                return {"image_url": self._placeholder_image(recipe), "image_source": "placeholder"}

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
            parts.append(f"The dish is inspired by ingredients such as {ingredient_text}, shown as cooked/served (not raw).")
        elif title:
            parts.append("The dish matches the recipe title concept, but do not write any words in the image.")
        parts.append("The dish should look diabetes-friendly (balanced plate, not overly sugary).")

        cooked_guidance = " ".join(
            [
                "The subject must look like a finished, plated, ready-to-eat meal (served dish, not prep).",
                "Main proteins must look clearly cooked (golden-brown sear, grill marks, roasted surface, crisp edges, flaky cooked fish as appropriate).",
                "Absolutely no raw meat, no raw fish, no uncooked chicken, no sashimi, no ingredient pile, no cutting board, no prep scene.",
                "Add subtle steam/heat cues when it makes sense for the dish.",
                "If the recipe is a drink/smoothie, show a finished ready-to-drink beverage instead (still no prep scene).",
            ]
        )
        return " ".join([*parts, cooked_guidance])

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

    def _generate_image_runware(self, prompt: str, *, size: int) -> bytes:
        """
        Generate an image using Runware API (e.g. FLUX Schnell).

        We request a single image and then download the returned URL (or decode base64 when provided).
        """
        if not self.runware_api_key:
            raise RuntimeError("RUNWARE_API_KEY is not set")
        if not self.runware_api_url:
            raise RuntimeError("RUNWARE_API_URL is not set")

        target = 512 if int(size) not in (512, 768, 1024) else int(size)
        task_uuid = str(uuid.uuid4())

        payload = [
            {
                "taskType": "imageInference",
                "taskUUID": task_uuid,
                "model": self.runware_image_model,
                "positivePrompt": prompt,
                "width": target,
                "height": target,
                "numberResults": 1,
                # Prefer URLs to avoid huge JSON payloads; we download bytes server-side.
                "outputType": "URL",
                "outputFormat": "JPG",
            }
        ]

        headers = {
            "Authorization": f"Bearer {self.runware_api_key}",
            "Content-Type": "application/json",
        }

        try:
            resp = httpx.post(self.runware_api_url, json=payload, headers=headers, timeout=60.0)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("Runware request failed") from exc

        if resp.status_code >= 400:
            raise RuntimeError(f"Runware returned {resp.status_code}")

        try:
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("Runware returned invalid JSON") from exc

        items = data.get("data") if isinstance(data, dict) else None
        if not isinstance(items, list) or not items:
            raise RuntimeError("Runware response missing data")

        image_url: str | None = None
        image_b64: str | None = None
        for item in items:
            if not isinstance(item, dict):
                continue
            if item.get("taskType") != "imageInference":
                continue
            # Common Runware field names
            image_url = item.get("imageURL") or item.get("imageUrl") or item.get("url")
            image_b64 = item.get("imageBase64Data") or item.get("imageBase64") or item.get("base64")
            if image_url or image_b64:
                break

        if image_b64 and isinstance(image_b64, str):
            try:
                # Allow both raw base64 and data URLs.
                b64 = image_b64.split(",", 1)[1] if image_b64.startswith("data:") and "," in image_b64 else image_b64
                decoded = base64.b64decode(b64, validate=False)
                if decoded:
                    return decoded
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError("Runware returned invalid base64 image") from exc

        if not image_url or not isinstance(image_url, str):
            raise RuntimeError("Runware response missing image URL")

        try:
            img_resp = httpx.get(image_url, timeout=60.0)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("Failed to download Runware image") from exc
        if img_resp.status_code >= 400 or not img_resp.content:
            raise RuntimeError("Failed to download Runware image")
        return bytes(img_resp.content)

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
        food_profile: dict[str, Any] | None = None,
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
        prompt_template = EAT_NOW_PROMPT if mode_norm in ("surprise", "quick") else OPENAI_PROMPT
        if mode_norm in ("surprise", "quick"):
            fast_chain = tier_cfg.get("recipe_models_fast") or []
            if isinstance(fast_chain, list) and fast_chain:
                model_chain = [str(m) for m in fast_chain if str(m).strip()]
            # For "Eat now" modes: run primary provider first, then fallback.
            deepseek_models = [m for m in model_chain if "deepseek" in m.lower()]
            other_models = [m for m in model_chain if "deepseek" not in m.lower()]
            if other_models and deepseek_models:
                model_chain = [*other_models, *deepseek_models]

        if mode_norm in ("surprise", "quick"):
            preferred_cuisines: list[str] = []
            country_code = None
            if isinstance(food_profile, dict):
                preferred_cuisines = [
                    str(x).strip().lower()
                    for x in (food_profile.get("preferred_cuisines") or [])
                    if isinstance(x, str) and str(x).strip()
                ]
                cc = food_profile.get("country_code")
                country_code = str(cc).strip().upper() if isinstance(cc, str) and str(cc).strip() else None

            def _cuisine_label(key: str) -> str:
                mapping = {
                    "west_african": "West African",
                    "east_african": "East African",
                    "mena": "North African / Middle Eastern",
                    "british_irish": "British / Irish",
                    "american_canadian": "American / Canadian",
                    "caribbean": "Caribbean",
                    "mediterranean": "Mediterranean",
                    "south_asian": "South Asian",
                    "east_asian": "East Asian",
                    "southeast_asian": "Southeast Asian",
                    "latin_american": "Latin American",
                    "european": "European",
                }
                return mapping.get(key, key.replace("_", " ").title())

            def _infer_default_cuisines(cc: str | None) -> list[str]:
                """Best-effort country->cuisine fallback when the user didn't choose cuisines."""
                if not cc:
                    return []
                # Very broad regional mapping; user selection always overrides this.
                west_africa = {"NG", "GH"}
                east_africa = {"KE", "TZ", "UG"}
                mena = {"EG", "SA", "AE", "QA", "KW", "OM", "BH", "JO", "LB", "MA", "TN", "DZ"}
                south_asia = {"IN", "PK", "BD", "LK", "NP"}
                east_asia = {"CN", "JP", "KR", "TW", "HK"}
                se_asia = {"PH", "TH", "VN", "ID", "MY", "SG"}
                latin = {"MX", "BR", "CO", "AR", "CL", "PE"}
                caribbean = {"JM", "TT", "BB", "BS", "GD", "LC"}
                if cc in west_africa:
                    return ["west_african"]
                if cc in east_africa:
                    return ["east_african"]
                if cc in mena:
                    return ["mena"]
                if cc in south_asia:
                    return ["south_asian"]
                if cc in east_asia:
                    return ["east_asian"]
                if cc in se_asia:
                    return ["southeast_asian"]
                if cc in latin:
                    return ["latin_american"]
                if cc in caribbean:
                    return ["caribbean"]
                if cc in {"GB", "IE"}:
                    return ["british_irish"]
                if cc in {"US", "CA"}:
                    return ["american_canadian"]
                # Default: no strong guess.
                return []

            allowed_keys = preferred_cuisines or _infer_default_cuisines(country_code)
            allowed_keys = [k for k in allowed_keys if k]  # defensive

            cuisine_labels: list[str] = []
            for key in allowed_keys:
                if key == "west_african" and country_code == "NG":
                    cuisine_labels.append("Nigerian-style West African")
                else:
                    cuisine_labels.append(_cuisine_label(key))

            # If we have an explicit preference (or inferred default), keep cuisine within that set.
            cuisines = None
            theme: str | None = None
            if cuisine_labels:
                if len(cuisine_labels) == 1:
                    theme = cuisine_labels[0]
                else:
                    # Use up to 3 of the user's cuisines to keep "surprise" variety without leaving their comfort zone.
                    sample = cuisine_labels[:]
                    random.shuffle(sample)
                    cuisines = tuple(sample[:3])
            else:
                # No preference and no country: use a broad, global rotation (include British / Irish too).
                cuisine_sets = [
                    ("Mediterranean", "Mexican-inspired", "Asian-inspired"),
                    ("British / Irish-inspired", "American comfort (healthy)", "Indian-inspired"),
                    ("West African-inspired", "Middle Eastern-inspired", "Caribbean-inspired"),
                    ("Italian-inspired (low-carb)", "Latin American-inspired", "Southeast Asian-inspired"),
                ]
                cuisines = random.choice(cuisine_sets)
            mode_parts = [
                (
                    f"All three recipes must be {theme} style. Do not output recipes from other regional cuisines "
                    f"(e.g., Caribbean, Mexican, Italian, Mediterranean, East Asian) unless the user asked for them."
                    if theme
                    else (
                        f"Theme the three recipes across these cuisines (ONLY): {', '.join(cuisines)}."
                        if cuisines
                        else "Theme the three recipes across cuisines the user prefers."
                    )
                ),
                "Ensure all three recipes are clearly different from each other (protein + method + flavor).",
                f"Variation token: {random.randint(1000, 9999)}.",
                "Instructions must be beginner-friendly: write 6-8 steps per recipe. Each step should include at least one concrete detail (time in minutes, heat level, visual cue, or exact action). Avoid vague steps like 'cook until done' without guidance.",
            ]
            if mode_norm == "quick":
                mode_parts.extend(
                    [
                        "All recipes must have total_time <= 20 minutes.",
                        "Oven is allowed if it still fits total_time <= 20 minutes (assume oven is preheated). Prefer faster methods (skillet, salad, quick saute) when possible.",
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

        # Profile-driven personalization (Phase 3). Keep it compact to protect latency/cost.
        try:
            from .food_profile_service import build_food_profile_instructions

            strength = "strong" if mode_norm in ("surprise", "quick") else "soft"
            profile_instructions = build_food_profile_instructions(
                food_profile,
                strength=strength,  # type: ignore[arg-type]
                mode=mode_norm or "ingredients",
                has_ingredients=bool(ingredients),
            )
            if profile_instructions:
                extra_instructions = f"{(extra_instructions or '').strip()}\n\n{profile_instructions}".strip()
        except Exception:
            # Never fail recipe generation due to profile formatting errors.
            pass

        def parse_content(raw: str) -> List[Dict[str, Any]]:
            import json, re

            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```[a-zA-Z]*", "", cleaned)
                cleaned = cleaned.strip("`").strip()

            def _escape_newlines_in_json_strings(text: str) -> str:
                # Some providers (notably Gemini) occasionally emit literal newlines inside JSON strings,
                # which makes the JSON invalid. Repair by escaping newlines *only when inside a string*.
                out: list[str] = []
                in_string = False
                escape = False
                for ch in text:
                    if in_string:
                        if escape:
                            escape = False
                            out.append(ch)
                            continue
                        if ch == "\\":
                            escape = True
                            out.append(ch)
                            continue
                        if ch == "\"":
                            in_string = False
                            out.append(ch)
                            continue
                        if ch == "\n":
                            out.append("\\n")
                            continue
                        if ch == "\r":
                            out.append("\\r")
                            continue
                        out.append(ch)
                        continue
                    else:
                        if ch == "\"":
                            in_string = True
                        out.append(ch)
                return "".join(out)

            try:
                data = json.loads(cleaned)
            except Exception as exc:
                # Try repairing invalid JSON caused by literal newlines inside quoted strings.
                try:
                    data = json.loads(_escape_newlines_in_json_strings(cleaned))
                except Exception:
                    data = None
                if settings.ai_debug_logging:
                    tail = cleaned[-240:] if len(cleaned) > 240 else cleaned
                    tail = tail.replace("\n", " ")
                    logger.info(
                        "AI json.loads failed error=%s len=%s tail=%s",
                        str(exc)[:200],
                        len(cleaned),
                        tail,
                    )
                # Some providers still wrap JSON with text. Try to extract a JSON object/array substring.
                start = cleaned.find("{")
                end = cleaned.rfind("}")
                if start != -1 and end != -1 and end > start:
                    try:
                        data = json.loads(_escape_newlines_in_json_strings(cleaned[start : end + 1]))
                    except Exception:
                        data = None
                else:
                    start = cleaned.find("[")
                    end = cleaned.rfind("]")
                    if start != -1 and end != -1 and end > start:
                        try:
                            data = json.loads(_escape_newlines_in_json_strings(cleaned[start : end + 1]))
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
            except Exception as exc:
                if settings.ai_debug_logging:
                    logger.info("AI parse_content normalize failed error=%s", str(exc)[:240])
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
        # "Eat now" modes are a daily-use feature: keep the total wall-clock budget bounded for UX.
        # Even if a higher timeout is passed from upstream, clamp surprise/quick to 60s.
        if mode_norm in ("surprise", "quick") and budget is not None:
            budget = min(budget, 60.0)
        attempts: list[dict[str, Any]] = []
        used_deterministic_schedule = False
        gemini_model = self.gemini_text_model
        has_gemini = bool(self.gemini_api_key and gemini_model)

        def _try_models(
            models: list[str],
            *,
            provider: str,
            client: OpenAI,
            phase_timeout: float | None,
        ) -> List[Dict[str, Any]] | None:
            phase_started = time.time()
            for model in models:
                if budget is not None:
                    remaining_total = budget - (time.time() - started)
                    if remaining_total <= 2:
                        break
                if phase_timeout is not None:
                    remaining_phase = phase_timeout - (time.time() - phase_started)
                    if remaining_phase <= 2:
                        break
                try:
                    # "Eat now" modes must be fast + JSON-clean. Keep temperature moderate to reduce verbosity
                    # and lower the chance of truncation/invalid JSON.
                    temperature = 0.55 if mode_norm in ("surprise", "quick") else (0.7 if variety_mode else 0.4)
                    per_request_timeout = None
                    if budget is not None:
                        remaining_total = budget - (time.time() - started)
                        if mode_norm in ("surprise", "quick"):
                            # Eat-now flows are async but UX-sensitive; allow a bit more time to avoid unnecessary fallbacks.
                            cap = 45.0 if budget <= 60.0 else 60.0
                        else:
                            # Non "Eat now" flows run async (job queue) so we can afford a longer per-request timeout.
                            # This significantly reduces false failures on slower networks / provider latency spikes.
                            cap = 45.0
                        per_request_timeout = max(5.0, min(cap, remaining_total))
                        if phase_timeout is not None:
                            remaining_phase = phase_timeout - (time.time() - phase_started)
                            per_request_timeout = max(5.0, min(per_request_timeout, remaining_phase))
                    if settings.ai_debug_logging:
                        base_url = str(getattr(client, "base_url", "") or "")
                        logger.info(
                            "AI attempt start mode=%s tier=%s provider=%s model=%s timeout=%s remaining_budget=%.2fs base_url=%s",
                            mode_norm or "ingredients",
                            tier,
                            provider,
                            model,
                            per_request_timeout,
                            (budget - (time.time() - started)) if budget is not None else -1.0,
                            base_url,
                        )
                    content = self._call(
                        client,
                        model,
                        ingredients,
                        filters,
                        prompt_template=prompt_template,
                        extra_instructions=extra_instructions,
                        temperature=temperature,
                        timeout_seconds=per_request_timeout,
                        # Give enough room to finish valid JSON (truncation => invalid JSON => slow fallback chain).
                        # The prompt already enforces concision, so a higher cap doesn't mean longer outputs.
                        max_output_tokens=2200 if mode_norm in ("surprise", "quick") else 2000,
                    )
                    parsed = parse_content(content)
                    recipes = self._filter_recipes(parsed, banned_titles_norm)
                    if recipes:
                        # Keep "Eat now" modes single-shot to stay within the 60s mobile budget.
                        if mode_norm not in ("surprise", "quick") and (exclude_titles or variety_mode) and len(recipes) < 3:
                            stricter = (extra_instructions or "") + " You must comply. Return 3 NEW recipes."
                            content2 = self._call(
                                client,
                                model,
                                ingredients,
                                filters,
                                prompt_template=prompt_template,
                                extra_instructions=stricter,
                                temperature=0.8,
                                timeout_seconds=per_request_timeout,
                                max_output_tokens=2000,
                            )
                            recipes2 = self._filter_recipes(parse_content(content2), banned_titles_norm)
                            if recipes2:
                                recipes = recipes2
                        recipes = recipes[:3]
                        for recipe in recipes:
                            if isinstance(recipe, dict):
                                recipe["_ai_provider"] = provider
                                recipe["_ai_model"] = model
                        if settings.ai_debug_logging:
                            logger.info(
                                "AI output accepted mode=%s tier=%s provider=%s model=%s recipes=%d",
                                mode_norm or "ingredients",
                                tier,
                                provider,
                                model,
                                len(recipes),
                            )
                        if generate_images:
                            self._attach_images(recipes, tier, ingredients)
                        else:
                            self._attach_placeholders(recipes)
                        return recipes
                    if settings.ai_debug_logging and settings.ai_log_raw_output:
                        raw_preview = (content or "").strip()
                        if len(raw_preview) > 6000:
                            raw_preview = raw_preview[:6000] + "…"
                        logger.info("AI raw output provider=%s model=%s raw=%s", provider, model, raw_preview)

                    if settings.ai_debug_logging:
                        preview = (content or "").strip().replace("\n", " ")
                        if len(preview) > 600:
                            preview = preview[:600] + "…"
                        logger.info(
                            "AI output rejected provider=%s model=%s reason=%s preview=%s",
                            provider,
                            model,
                            ("empty_content" if not (content or "").strip() else "unparseable_or_empty_recipes"),
                            preview,
                        )
                    attempts.append({"model": model, "provider": provider, "error": "empty_or_unparseable_json"})
                except OpenAIError as exc:
                    logger.warning("Model %s failed, trying next: %s", model, exc)
                    attempts.append({"model": model, "provider": provider, "error": str(exc)})
                    continue
            return None

        # Surprise/Quick: deterministic 60s schedule (30s primary, then 30s fallback).
        if mode_norm in ("surprise", "quick") and budget is not None:
            openai_models = [m for m in model_chain if "deepseek" not in m.lower()]
            deepseek_models = [m for m in model_chain if "deepseek" in m.lower()]
            gemini_model = self.gemini_text_model
            has_gemini = bool(self.gemini_api_key and gemini_model)
            if self.primary_client and (has_gemini or self.fallback_client) and openai_models and (gemini_model or deepseek_models):
                used_deterministic_schedule = True
                # Give the primary provider enough time to actually return (otherwise we burn time on fallbacks).
                # Keep a hard ceiling for mobile UX; fallbacks use whatever remains.
                if budget >= 60.0:
                    phase_budget = 40.0
                else:
                    phase_budget = max(5.0, budget / 2.0)
                if settings.ai_debug_logging:
                    logger.info(
                        "AI schedule mode=%s tier=%s primary_budget=%.1fs fallback_budget=remaining total_budget=%.1fs",
                        mode_norm,
                        tier,
                        phase_budget,
                        budget,
                    )
                recipes = _try_models(
                    openai_models[:1],
                    provider="openai",
                    client=self.primary_client,
                    phase_timeout=phase_budget,
                )
                if recipes:
                    return recipes

                # Use remaining time for the fallback provider (Gemini first if configured, then DeepSeek).
                remaining_total = max(0.0, budget - (time.time() - started))
                fallback_budget = remaining_total

                if has_gemini and gemini_model:
                    if settings.ai_debug_logging:
                        logger.info(
                            "AI switching to fallback provider=gemini mode=%s tier=%s remaining_total=%.1fs fallback_budget=%.1fs model=%s",
                            mode_norm,
                            tier,
                            remaining_total,
                            fallback_budget,
                            gemini_model,
                        )
                    try:
                        def _call_gemini_once(extra: str | None = None) -> str:
                            tighten = (
                                "Return ONLY valid JSON. Keep each description under 120 characters. "
                                "Use at most 8 ingredients and at most 5 short steps per recipe. "
                                "Do not use line breaks inside strings."
                            )
                            merged_extra = " ".join([x for x in [(extra_instructions or "").strip(), tighten, (extra or "").strip()] if x]).strip()
                            return self._call_gemini_text(
                                gemini_model,
                                ingredients,
                                filters,
                                prompt_template=prompt_template,
                                extra_instructions=merged_extra,
                                temperature=0.45,
                                timeout_seconds=fallback_budget if fallback_budget >= 5 else 5.0,
                                max_output_tokens=1200,
                            )

                        content = _call_gemini_once()
                        try:
                            parsed = parse_content(content)
                            recipes = self._filter_recipes(parsed, banned_titles_norm)
                        except Exception:
                            # One retry: Gemini occasionally returns truncated/invalid JSON; a second call usually fixes it.
                            content = _call_gemini_once("Retry: ensure the JSON is complete and parseable.")
                            parsed = parse_content(content)
                            recipes = self._filter_recipes(parsed, banned_titles_norm)
                        if recipes:
                            recipes = recipes[:3]
                            for recipe in recipes:
                                if isinstance(recipe, dict):
                                    recipe["_ai_provider"] = "gemini"
                                    recipe["_ai_model"] = gemini_model
                            if settings.ai_debug_logging:
                                logger.info(
                                    "AI output accepted mode=%s tier=%s provider=gemini model=%s recipes=%d",
                                    mode_norm,
                                    tier,
                                    gemini_model,
                                    len(recipes),
                                )
                            if generate_images:
                                self._attach_images(recipes, tier, ingredients)
                            else:
                                self._attach_placeholders(recipes)
                            return recipes
                        attempts.append({"model": gemini_model, "provider": "gemini", "error": "empty_or_unparseable_json"})
                        if settings.ai_debug_logging and settings.ai_log_raw_output:
                            raw_preview = (content or "").strip()
                            if len(raw_preview) > 6000:
                                raw_preview = raw_preview[:6000] + "…"
                            logger.info("AI raw output provider=gemini model=%s raw=%s", gemini_model, raw_preview)
                    except Exception as exc:  # noqa: BLE001
                        # Important: log why Gemini didn't run/returned empty so we don't silently waste fallback time.
                        logger.warning("Gemini fallback failed (model=%s): %s", gemini_model, str(exc)[:400])
                        attempts.append({"model": gemini_model, "provider": "gemini", "error": str(exc)})

                if self.fallback_client and deepseek_models:
                    if settings.ai_debug_logging:
                        logger.info(
                            "AI switching to fallback provider=deepseek mode=%s tier=%s remaining_total=%.1fs fallback_budget=%.1fs",
                            mode_norm,
                            tier,
                            remaining_total,
                            fallback_budget,
                        )
                    recipes = _try_models(
                        deepseek_models[:1],
                        provider="deepseek",
                        client=self.fallback_client,
                        phase_timeout=fallback_budget,
                    )
                    if recipes:
                        return recipes
            # If only one provider is configured, fall through to the generic model-chain logic below.

        # Generic: iterate through model chain with provider-specific clients
        if used_deterministic_schedule:
            # We already tried primary + fallback within the full budget; don't loop again.
            model_chain = []
        for model in model_chain:
            if budget is not None:
                remaining = budget - (time.time() - started)
                if remaining <= 2:
                    break
            use_fallback = "deepseek" in model.lower()
            provider = "deepseek" if use_fallback else "openai"
            client = self.fallback_client if use_fallback else self.primary_client
            if not client:
                attempts.append({"model": model, "provider": provider, "error": "client_not_configured"})
                continue
            recipes = _try_models([model], provider=provider, client=client, phase_timeout=None)
            if recipes:
                return recipes

        # Fallback for non "eat now" flows: try Gemini even if it isn't part of the model chain.
        # This significantly reduces "all models failed" incidents when OpenAI-compatible providers return invalid JSON.
        if not used_deterministic_schedule and has_gemini and gemini_model:
            try:
                remaining_total = None
                if budget is not None:
                    remaining_total = budget - (time.time() - started)
                # Keep bounded for UX/cost; use what's left if we're already near budget end.
                gemini_timeout = 20.0
                if remaining_total is not None:
                    gemini_timeout = max(5.0, min(20.0, remaining_total))
                content = self._call_gemini_text(
                    gemini_model,
                    ingredients,
                    filters,
                    prompt_template=prompt_template,
                    extra_instructions=extra_instructions,
                    temperature=0.55 if mode_norm in ("surprise", "quick") else (0.7 if variety_mode else 0.4),
                    timeout_seconds=gemini_timeout,
                    max_output_tokens=2200,
                )
                parsed = parse_content(content)
                recipes = self._filter_recipes(parsed, banned_titles_norm)
                if recipes:
                    for recipe in recipes:
                        if isinstance(recipe, dict):
                            recipe["_ai_provider"] = "gemini"
                            recipe["_ai_model"] = gemini_model
                    if settings.ai_debug_logging:
                        logger.info(
                            "AI output accepted mode=%s tier=%s provider=gemini model=%s recipes=%d",
                            mode_norm or "ingredients",
                            tier,
                            gemini_model,
                            len(recipes),
                        )
                    if generate_images:
                        self._attach_images(recipes, tier, ingredients)
                    else:
                        self._attach_placeholders(recipes)
                    return recipes
                attempts.append({"model": gemini_model, "provider": "gemini", "error": "empty_or_unparseable_json"})
            except Exception as exc:  # noqa: BLE001
                logger.warning("Gemini fallback failed (model=%s): %s", gemini_model, str(exc)[:400])
                attempts.append({"model": gemini_model, "provider": "gemini", "error": str(exc)})

        fallback = emergency_recipes()
        if settings.ai_disable_emergency_fallback:
            # Do not leak internal config details to end users.
            raise RuntimeError("Unable to generate recipes right now. Please try again in a moment.")
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
