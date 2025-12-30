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
        self.fallback_client = (
            OpenAI(api_key=settings.deepseek_api_key, base_url=settings.deepseek_base_url)
            if settings.deepseek_api_key
            else None
        )
        self.fallback_model = settings.deepseek_model
        self.enabled = bool(self.primary_client or self.fallback_client)

    def _call(self, client: OpenAI, model: str, ingredients: List[str]) -> str:
        prompt = (
            "Generate 3 diabetes-friendly recipes using these ingredients. "
            "Return JSON with fields: title, description, ingredients[{name,quantity,unit}], "
            "instructions[], prep_time, cook_time, total_time, difficulty, nutritional_info, "
            "tags, image_url, servings, glycemic_index."
        )
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a diabetes-safe recipe generator."},
                {"role": "user", "content": f"{prompt}\nIngredients: {', '.join(ingredients)}"},
            ],
            temperature=0.4,
        )
        return resp.choices[0].message.content or ""

    def generate(self, ingredients: List[str]) -> List[Dict[str, Any]]:
        if not self.enabled:
            raise RuntimeError("AI recipe generation not configured: provide OPENAI_API_KEY or DEEPSEEK_API_KEY")

        if self.primary_client:
            try:
                content = self._call(self.primary_client, self.primary_model, ingredients)
                return [{"raw": content}]
            except OpenAIError as exc:
                logger.warning("Primary recipe generation failed, attempting fallback: %s", exc)

        if self.fallback_client:
            try:
                content = self._call(self.fallback_client, self.fallback_model, ingredients)
                return [{"raw": content}]
            except OpenAIError as exc:
                logger.exception("Fallback recipe generation failed")
                raise

        raise RuntimeError("No recipe provider available")
