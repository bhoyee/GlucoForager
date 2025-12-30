from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.ai_request import AIRequest
from ...models.user import User
from ..dependencies import get_current_user

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/ai-requests")
def ai_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    records = (
        db.query(AIRequest)
        .filter(AIRequest.user_id == current_user.id)
        .order_by(AIRequest.created_at.desc())
        .limit(20)
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "type": r.request_type,
                "model": r.model_used,
                "created_at": r.created_at,
                "tier": r.tier,
            }
            for r in records
        ]
    }
