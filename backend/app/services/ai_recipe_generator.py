import logging
from typing import Any, Dict, List

from openai import OpenAI, OpenAIError

from ..core.config import settings
from ..core.constants import DEFAULT_TAGS, EMPTY_NUTRITION

logger = logging.getLogger(__name__)


class AIRecipeGenerator:
    """GPT-5 powered recipe generator with diabetes-friendly emphasis."""

    def __init__(self) -> None:
        api_key = settings.openai_api_key
        self.enabled = bool(api_key)
        self.client = OpenAI(api_key=api_key) if api_key else None
        self.model = settings.openai_model

    def generate(self, ingredients: List[str]) -> List[Dict[str, Any]]:
        if not self.enabled:
            logger.info("AI recipe generation disabled (no API key); returning mock recipes")
            return [
                {
                    "title": "Mock Lemon Garlic Chicken",
                    "description": "Placeholder diabetes-friendly recipe",
                    "ingredients": [{"name": i, "quantity": 1, "unit": "unit"} for i in ingredients],
                    "instructions": ["Prep ingredients", "Cook thoroughly", "Serve warm"],
                    "prep_time": 10,
                    "cook_time": 20,
                    "total_time": 30,
                    "difficulty": "Easy",
                    "nutritional_info": EMPTY_NUTRITION,
                    "tags": DEFAULT_TAGS,
                    "image_url": "",
                    "servings": 2,
                    "glycemic_index": 10,
                }
            ]
        prompt = (
            "Generate 3 diabetes-friendly recipes using these ingredients. "
            "Return JSON with fields: title, description, ingredients[{name,quantity,unit}], "
            "instructions[], prep_time, cook_time, total_time, difficulty, nutritional_info, "
            "tags, image_url, servings, glycemic_index."
        )
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a diabetes-safe recipe generator."},
                    {"role": "user", "content": f"{prompt}\nIngredients: {', '.join(ingredients)}"},
                ],
                temperature=0.4,
            )
            content = resp.choices[0].message.content or ""
            # For simplicity, return raw content; a production system would JSON-parse and validate.
            return [{"raw": content}]
        except OpenAIError as exc:
            logger.exception("AI recipe generation failed")
            return [{"error": str(exc)}]
