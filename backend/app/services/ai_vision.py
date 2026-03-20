import logging
import re
from typing import Any, Dict

from openai import OpenAI, OpenAIError

from ..core.config import settings

logger = logging.getLogger(__name__)


class AIVisionService:
    """Wrapper for GPT-5 Vision primary with DeepSeek fallback."""

    def _parse_ingredients(self, content: str) -> list[str]:
        raw = (content or "").strip()
        if not raw:
            return []
        # Normalize common bullet/list formats into a simple list.
        raw = raw.replace("\r", "\n")
        raw = re.sub(r"^[\\s\\-•*\\d.()]+", "", raw, flags=re.MULTILINE)
        parts = [p.strip() for p in re.split(r"[,;\\n]+", raw) if p and p.strip()]
        return [p for p in parts if p]

    def __init__(self) -> None:
        self.primary_client = (
            OpenAI(api_key=settings.openai_api_key, organization=settings.openai_organization)
            if settings.openai_api_key
            else None
        )
        self.primary_model = settings.openai_vision_model
        # DeepSeek currently does not support image_url content; disable fallback for vision to avoid 400s.
        self.fallback_client = None
        self.fallback_model = None
        self.enabled = bool(self.primary_client)

    def _call(self, client: OpenAI, model: str, images_b64: list[str], *, timeout_seconds: float) -> str:
        image_parts = [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}}
            for image_b64 in (images_b64 or [])
            if isinstance(image_b64, str) and image_b64.strip()
        ]
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract ONLY edible food/drink items from the photo(s). "
                        "Include: produce (e.g., leafy greens), spreads/condiments (e.g., nut butter), "
                        "and packaged drinks/foods by reading labels when visible. "
                        "If a brand/label name is clearly readable, prefer that (e.g., 'unsweetened almond milk', "
                        "'diet soda') instead of a generic category. "
                        "Ignore non-food items (electronics, furniture, tools, etc.). "
                        "If no food/drink items are visible, return an empty string. "
                        "Return a comma-separated list of short item names (no sentences)."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Identify ingredients visible across the provided photo(s)."},
                        *image_parts,
                    ],
                },
            ],
            temperature=0.2,
            timeout=timeout_seconds,
        )
        return resp.choices[0].message.content or ""

    def analyze_fridge(self, image_b64: str, tier: str) -> Dict[str, Any]:
        if not self.enabled:
            return {"ingredients": [], "raw": "vision_disabled"}

        # Tier-specific model preference
        tier_model = settings.openai_vision_model
        fallback_model = self.fallback_model
        from ..core.constants import TIER_CONFIG  # local import to avoid cycle

        tier_cfg = TIER_CONFIG.get(tier, {})
        if tier_cfg.get("vision_model"):
            tier_model = tier_cfg["vision_model"]
        if tier_cfg.get("vision_model"):
            fallback_model = tier_cfg["vision_model"]

        # Try primary
        if self.primary_client:
            try:
                content = self._call(self.primary_client, tier_model, [image_b64], timeout_seconds=25.0)
                return {"ingredients": self._parse_ingredients(content), "raw": content}
            except OpenAIError as exc:
                logger.warning("Primary vision failed: %s", exc)

        if self.fallback_client and fallback_model:
            try:
                content = self._call(self.fallback_client, fallback_model, image_b64)
                return {"ingredients": [i.strip() for i in content.split(",") if i.strip()], "raw": content}
            except OpenAIError as exc:
                logger.exception("Fallback vision failed")
                return {"ingredients": [], "raw": "vision_fallback_error"}

        # Graceful fallback if nothing worked
        return {"ingredients": [], "raw": "vision_unavailable"}

    def analyze_fridge_batch(self, images_b64: list[str], tier: str) -> Dict[str, Any]:
        if not self.enabled:
            return {"ingredients": [], "raw": "vision_disabled"}

        tier_model = settings.openai_vision_model
        fallback_model = self.fallback_model
        from ..core.constants import TIER_CONFIG  # local import to avoid cycle

        tier_cfg = TIER_CONFIG.get(tier, {})
        if tier_cfg.get("vision_model"):
            tier_model = tier_cfg["vision_model"]
        if tier_cfg.get("vision_model"):
            fallback_model = tier_cfg["vision_model"]

        # One call with multiple images is typically faster and more reliable than multiple sequential calls.
        if self.primary_client:
            try:
                content = self._call(self.primary_client, tier_model, images_b64, timeout_seconds=45.0)
                parsed = self._parse_ingredients(content)
                if parsed:
                    return {"ingredients": parsed, "raw": content}
            except OpenAIError as exc:
                logger.warning("Primary vision batch failed: %s", exc)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Primary vision batch failed: %s", str(exc)[:240])

        # Robust fallback: if the multi-image call fails/returns empty, try per-image calls and merge results.
        merged: list[str] = []
        for img in images_b64 or []:
            if not (isinstance(img, str) and img.strip()):
                continue
            try:
                if not self.primary_client:
                    continue
                content = self._call(self.primary_client, tier_model, [img], timeout_seconds=25.0)
                merged.extend(self._parse_ingredients(content))
            except Exception:
                continue

        if merged:
            seen: set[str] = set()
            unique: list[str] = []
            for item in merged:
                key = (item or "").strip().lower()
                if not key or key in seen:
                    continue
                seen.add(key)
                unique.append(item)
            return {"ingredients": unique, "raw": "per_image_fallback"}

        if self.fallback_client and fallback_model:
            try:
                content = self._call(self.fallback_client, fallback_model, images_b64, timeout_seconds=35.0)
                return {"ingredients": self._parse_ingredients(content), "raw": content}
            except OpenAIError as exc:
                logger.exception("Fallback vision batch failed")
                return {"ingredients": [], "raw": "vision_fallback_error"}

        return {"ingredients": [], "raw": "vision_unavailable"}
