import logging
from typing import Any, Dict, List

from openai import OpenAI, OpenAIError

from ..core.config import settings

logger = logging.getLogger(__name__)


class AIRecipeGenerator:
    """GPT-5 recipe generator with DeepSeek fallback."""

    def __init__(self) -> None:
        self.primary_client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
        self.primary_model = settings.openai_model
        # DeepSeek fallback for text (vision not supported)
        self.fallback_client = (
            OpenAI(api_key=settings.deepseek_api_key, base_url=settings.deepseek_base_url)
            if settings.deepseek_api_key
            else None
        )
        self.fallback_model = settings.deepseek_model
        self.enabled = bool(self.primary_client or self.fallback_client)

    def _call(self, client: OpenAI, model: str, ingredients: List[str], filters: List[str]) -> str:
        prompt = (
            "Generate 3 diabetes-friendly recipes using these ingredients. "
            "Return JSON with fields: title, description, ingredients[{name,quantity,unit}], "
            "instructions[], prep_time, cook_time, total_time, difficulty, nutritional_info, "
            "tags, image_url, servings, glycemic_index."
        )
        if filters:
            prompt += f" Apply dietary filters: {', '.join(filters)}."
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a diabetes-safe recipe generator."},
                {"role": "user", "content": f"{prompt}\nIngredients: {', '.join(ingredients)}"},
            ],
            temperature=0.4,
        )
        return resp.choices[0].message.content or ""

    def generate(self, ingredients: List[str], tier: str, filters: List[str] | None = None) -> List[Dict[str, Any]]:
        if not self.enabled:
            raise RuntimeError("AI recipe generation not configured: provide OPENAI_API_KEY or DEEPSEEK_API_KEY")

        filters = filters or []
        from ..core.constants import TIER_CONFIG  # local import to avoid cycle
        tier_cfg = TIER_CONFIG.get(tier, {})
        primary_model = tier_cfg.get("recipe_model", self.primary_model)
        fallback_model = tier_cfg.get("recipe_model", self.fallback_model)

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
                    return data
            except Exception:
                pass
            return [
                {
                    "title": "AI-Generated Recipe",
                    "description": cleaned[:200],
                    "ingredients": [{"name": i, "quantity": 1, "unit": ""} for i in ingredients],
                    "instructions": ["AI could not format steps; see description above."],
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

        if self.primary_client:
            try:
                content = self._call(self.primary_client, primary_model, ingredients, filters)
                return parse_content(content)
            except OpenAIError as exc:
                logger.warning("Primary recipe generation failed, attempting fallback: %s", exc)

        if self.fallback_client and self.fallback_model:
            try:
                content = self._call(self.fallback_client, fallback_model, ingredients, filters)
                return parse_content(content)
            except OpenAIError as exc:
                logger.exception("Fallback recipe generation failed")
                raise

        raise RuntimeError("No recipe provider available")
