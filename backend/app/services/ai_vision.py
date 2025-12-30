import logging
from typing import Any, Dict, List

from openai import OpenAI, OpenAIError

from ..core.config import settings

logger = logging.getLogger(__name__)


class AIVisionService:
    """Wrapper for GPT-5 Vision (or equivalent) to analyze fridge/pantry photos."""

    def __init__(self) -> None:
        api_key = settings.openai_api_key
        self.enabled = bool(api_key)
        self.client = OpenAI(api_key=api_key) if api_key else None
        self.model = settings.openai_vision_model

    def analyze_fridge(self, image_b64: str) -> Dict[str, Any]:
        """Accepts a base64 image string; returns detected ingredients list and notes."""
        if not self.enabled:
            logger.info("AI vision disabled (no API key); returning mock response")
            return {
                "ingredients": ["spinach", "chicken breast", "bell pepper", "lemon"],
                "confidence": "mock",
                "notes": "Vision disabled; using placeholder items.",
            }
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "Extract ingredient names from the fridge photo. Return a JSON list.",
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Identify ingredients visible."},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                        ],
                    },
                ],
                temperature=0.2,
            )
            content = resp.choices[0].message.content or ""
            return {"ingredients": [item.strip() for item in content.split(",") if item.strip()], "raw": content}
        except OpenAIError as exc:
            logger.exception("Vision analysis failed")
            return {"ingredients": [], "error": str(exc)}
