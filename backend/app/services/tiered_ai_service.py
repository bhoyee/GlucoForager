import base64
import hashlib
import io
import json
import logging
from typing import Any, Dict, List

from PIL import Image
from openai import OpenAI

from ..core.constants import TIER_CONFIG
from ..core.config import settings
from .ai_recipe_generator import AIRecipeGenerator
from .ai_vision import AIVisionService
from .cache_service import CacheService

logger = logging.getLogger(__name__)


class TieredAIService:
    """Tier-aware AI orchestration with caching and fallback."""

    def __init__(self) -> None:
        self.vision = AIVisionService()
        self.generator = AIRecipeGenerator()
        self.cache = CacheService()

    def _normalize_image_b64_for_vision(self, image_b64: str) -> tuple[str, str]:
        """
        Reduce payload size for vision calls (faster + cheaper) and generate a stable digest for caching.

        Returns (normalized_base64, digest).
        """
        raw_input = (image_b64 or "").strip()
        if not raw_input:
            return "", ""

        # Strip any data URL prefix if present.
        if raw_input.startswith("data:") and "base64," in raw_input:
            raw_input = raw_input.split("base64,", 1)[1].strip()

        try:
            decoded = base64.b64decode(raw_input, validate=False)
        except Exception:
            # If it isn't valid base64, just hash the input string.
            return raw_input, hashlib.sha256(raw_input.encode("utf-8")).hexdigest()

        try:
            with Image.open(io.BytesIO(decoded)) as image:
                image = image.convert("RGB")
                # Keep enough detail for ingredient detection while bounding size.
                image.thumbnail((1024, 1024))
                buffer = io.BytesIO()
                image.save(buffer, format="JPEG", quality=72, optimize=True)
                normalized_bytes = buffer.getvalue()
        except Exception:
            # If PIL can't decode, fall back to the original bytes.
            normalized_bytes = decoded

        digest = hashlib.sha256(normalized_bytes).hexdigest()
        normalized_b64 = base64.b64encode(normalized_bytes).decode("utf-8")
        return normalized_b64, digest

    def _cache_key(self, namespace: str, payload: Dict[str, Any]) -> str:
        raw = json.dumps(payload, sort_keys=True)
        return f"{namespace}:{hashlib.sha256(raw.encode()).hexdigest()}"

    def _should_cache(self, tier: str) -> bool:
        return TIER_CONFIG.get(tier, {}).get("cache_priority", "low") == "high"

    def analyze_vision(self, image_b64: str, tier: str) -> Dict[str, Any]:
        normalized_b64, digest = self._normalize_image_b64_for_vision(image_b64)
        payload = {"image_digest": digest, "tier": tier, "v": 1}
        key = self._cache_key("vision", payload)
        if self._should_cache(tier):
            cached = self.cache.get(key)
            if cached:
                try:
                    return json.loads(cached)
                except Exception:
                    pass
        result = self.vision.analyze_fridge(normalized_b64 or image_b64, tier)
        if self._should_cache(tier):
            self.cache.set(key, json.dumps(result), ttl_seconds=300)
        return result

    def analyze_vision_batch(self, images_b64: list[str], tier: str) -> Dict[str, Any]:
        normalized_images: list[str] = []
        digests: list[str] = []
        for raw in (images_b64 or []):
            normalized_b64, digest = self._normalize_image_b64_for_vision(raw)
            if normalized_b64:
                normalized_images.append(normalized_b64)
            elif isinstance(raw, str) and raw.strip():
                normalized_images.append(raw.strip())
            if digest:
                digests.append(digest)

        batch_digest = hashlib.sha256("|".join(digests).encode("utf-8")).hexdigest() if digests else ""
        payload = {"image_digest": batch_digest, "count": len(normalized_images), "tier": tier, "v": 1}
        key = self._cache_key("vision_batch", payload)

        if self._should_cache(tier):
            cached = self.cache.get(key)
            if cached:
                try:
                    return json.loads(cached)
                except Exception:
                    pass

        result = self.vision.analyze_fridge_batch(normalized_images, tier)
        if self._should_cache(tier):
            self.cache.set(key, json.dumps(result), ttl_seconds=300)
        return result

    def generate_recipes(
        self,
        ingredients: List[str],
        tier: str,
        filters: List[str] | None = None,
        exclude_titles: List[str] | None = None,
        variety_mode: bool = False,
        mode: str | None = None,
        timeout_seconds: float | None = None,
        generate_images: bool = True,
        food_profile: Dict[str, Any] | None = None,
    ) -> List[Dict[str, Any]]:
        payload = {
            "ingredients": ingredients,
            "tier": tier,
            "filters": filters or [],
            "exclude_titles": exclude_titles or [],
            "variety_mode": bool(variety_mode),
            "mode": (mode or ""),
            "food_profile": food_profile or {},
        }
        key = self._cache_key("recipes", payload)
        should_cache = self._should_cache(tier) and not (exclude_titles or variety_mode)
        if should_cache:
            cached = self.cache.get(key)
            if cached:
                try:
                    return json.loads(cached)
                except Exception:
                    pass
        result = self.generator.generate(
            ingredients,
            tier=tier,
            filters=filters or [],
            exclude_titles=exclude_titles or [],
            variety_mode=variety_mode,
            mode=mode,
            timeout_seconds=timeout_seconds,
            generate_images=generate_images,
            food_profile=food_profile,
        )
        if should_cache:
            self.cache.set(key, json.dumps(result), ttl_seconds=300)
        return result
