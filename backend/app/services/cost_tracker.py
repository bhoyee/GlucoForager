from datetime import datetime

from datetime import datetime

from sqlalchemy.orm import Session

from ..models.ai_request import AIRequest
from .user_activity_service import add_user_activity


ACTIVITY_LABELS = {
    "daily_plan": "Generated daily meal plan",
    "agent": "Asked GlucoGuide AI",
    "recipe_image": "Generated recipe image",
    "recipes": "Generated recipes",
    "swaps": "Generated food swaps",
    "vision": "Scanned ingredients",
    "vision_batch": "Scanned ingredients",
}


def record_ai_request(
    db: Session,
    user_id: int,
    tier: str,
    request_type: str,
    model_used: str,
    tokens_used: int = 0,
    cost_estimate: float = 0.0,
    device_id: str | None = None,
) -> None:
    entry = AIRequest(
        user_id=user_id,
        device_id=device_id,
        tier=tier,
        request_type=request_type,
        model_used=model_used,
        tokens_used=tokens_used,
        cost_estimate=cost_estimate,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    add_user_activity(
        db,
        user_id=user_id,
        event_type="ai.request",
        label=ACTIVITY_LABELS.get(request_type, f"Used {request_type} AI"),
        source="mobile",
        metadata={"request_type": request_type, "model_used": model_used, "tier": tier},
    )
    db.commit()
