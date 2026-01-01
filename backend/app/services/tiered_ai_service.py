import hashlib
import json
import logging
from typing import Any, Dict, List

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

    def _cache_key(self, namespace: str, payload: Dict[str, Any]) -> str:
        raw = json.dumps(payload, sort_keys=True)
        return f"{namespace}:{hashlib.sha256(raw.encode()).hexdigest()}"

    def _should_cache(self, tier: str) -> bool:
        return TIER_CONFIG.get(tier, {}).get("cache_priority", "low") == "high"

    def analyze_vision(self, image_b64: str, tier: str) -> Dict[str, Any]:
        payload = {"image": image_b64, "tier": tier}
        key = self._cache_key("vision", payload)
        if self._should_cache(tier):
            cached = self.cache.get(key)
            if cached:
                try:
                    return json.loads(cached)
                except Exception:
                    pass
        result = self.vision.analyze_fridge(image_b64, tier)
        if self._should_cache(tier):
            self.cache.set(key, json.dumps(result), ttl_seconds=300)
        return result

    def generate_recipes(self, ingredients: List[str], tier: str, filters: List[str] | None = None) -> List[Dict[str, Any]]:
        payload = {"ingredients": ingredients, "tier": tier, "filters": filters or []}
        key = self._cache_key("recipes", payload)
        if self._should_cache(tier):
            cached = self.cache.get(key)
            if cached:
                try:
                    return json.loads(cached)
                except Exception:
                    pass
        result = self.generator.generate(ingredients, tier=tier, filters=filters or [])
        if self._should_cache(tier):
            self.cache.set(key, json.dumps(result), ttl_seconds=300)
        return result
