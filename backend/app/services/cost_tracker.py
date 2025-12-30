from datetime import datetime

from sqlalchemy.orm import Session

from ..models.ai_request import AIRequest


def record_ai_request(
    db: Session,
    user_id: int,
    tier: str,
    request_type: str,
    model_used: str,
    tokens_used: int = 0,
    cost_estimate: float = 0.0,
) -> None:
    entry = AIRequest(
        user_id=user_id,
        tier=tier,
        request_type=request_type,
        model_used=model_used,
        tokens_used=tokens_used,
        cost_estimate=cost_estimate,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    db.commit()
