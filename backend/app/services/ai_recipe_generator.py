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
        # DeepSeek fallback is disabled until a compatible model is confirmed.
        self.fallback_client = None
        self.fallback_model = None
        self.enabled = bool(self.primary_client)

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

        if self.primary_client:
            try:
                content = self._call(self.primary_client, primary_model, ingredients, filters)
                return [{"raw": content}]
            except OpenAIError as exc:
                logger.warning("Primary recipe generation failed, attempting fallback: %s", exc)

        if self.fallback_client and self.fallback_model:
            try:
                content = self._call(self.fallback_client, fallback_model, ingredients, filters)
                return [{"raw": content}]
            except OpenAIError as exc:
                logger.exception("Fallback recipe generation failed")
                raise

        raise RuntimeError("No recipe provider available")
