import logging
from typing import Any, Dict

from openai import OpenAI, OpenAIError

from ..core.config import settings

logger = logging.getLogger(__name__)


class AIVisionService:
    """Wrapper for GPT-5 Vision primary with DeepSeek fallback."""

    def __init__(self) -> None:
        self.primary_client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
        self.primary_model = settings.openai_vision_model
        self.fallback_client = (
            OpenAI(api_key=settings.deepseek_api_key, base_url=settings.deepseek_base_url)
            if settings.deepseek_api_key
            else None
        )
        self.fallback_model = settings.deepseek_vision_model
        self.enabled = bool(self.primary_client or self.fallback_client)

    def _call(self, client: OpenAI, model: str, image_b64: str) -> str:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "Extract ingredient names from the fridge photo. Return a comma-separated list.",
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
        return resp.choices[0].message.content or ""

    def analyze_fridge(self, image_b64: str) -> Dict[str, Any]:
        if not self.enabled:
            raise RuntimeError("AI vision not configured: provide OPENAI_API_KEY or DEEPSEEK_API_KEY")

        # Try primary
        if self.primary_client:
            try:
                content = self._call(self.primary_client, self.primary_model, image_b64)
                return {"ingredients": [i.strip() for i in content.split(",") if i.strip()], "raw": content}
            except OpenAIError as exc:
                logger.warning("Primary vision failed, attempting fallback: %s", exc)

        if self.fallback_client:
            try:
                content = self._call(self.fallback_client, self.fallback_model, image_b64)
                return {"ingredients": [i.strip() for i in content.split(",") if i.strip()], "raw": content}
            except OpenAIError as exc:
                logger.exception("Fallback vision failed")
                raise

        raise RuntimeError("No vision provider available")
