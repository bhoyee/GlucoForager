from typing import Any, Dict, List

from sqlalchemy.orm import Session

from ..services.tiered_ai_service import TieredAIService
from .cost_tracker import record_ai_request


class AIPipeline:
    """End-to-end AI pipeline: vision -> recipes, with usage tracking."""

    def __init__(self) -> None:
        self.ai = TieredAIService()

    def fridge_to_recipes(
        self,
        db: Session,
        user_id: int,
        tier: str,
        image_base64: str,
        filters: list[str] | None = None,
        device_id: str | None = None,
    ) -> Dict[str, Any]:
        analysis = self.ai.analyze_vision(image_base64, tier)
        ingredients = analysis.get("ingredients", [])
        recipes = self.ai.generate_recipes(ingredients, tier, filters=filters)
        record_ai_request(db, user_id, tier, "vision", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        record_ai_request(db, user_id, tier, "recipes", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        return {"recipes": recipes, "detected": ingredients, "filters": filters or []}

    def text_to_recipes(
        self,
        db: Session,
        user_id: int,
        tier: str,
        ingredients: List[str],
        filters: list[str] | None = None,
        device_id: str | None = None,
    ) -> List[Dict[str, Any]]:
        recipes = self.ai.generate_recipes(ingredients, tier, filters=filters)
        record_ai_request(db, user_id, tier, "text", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        return recipes
