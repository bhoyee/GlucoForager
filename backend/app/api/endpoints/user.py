from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.ai_request import AIRequest
from ...models.user import SearchLog, User
from ..dependencies import get_current_user

router = APIRouter(prefix="/user", tags=["user"])


@router.get("/profile")
def profile(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "subscription_tier": current_user.subscription_tier,
    }


@router.get("/scans-today")
def scans_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    tomorrow = date.fromordinal(today.toordinal() + 1)
    ai_count = (
        db.query(AIRequest)
        .filter(AIRequest.user_id == current_user.id, AIRequest.created_at >= today, AIRequest.created_at < tomorrow)
        .count()
    )
    text_count = (
        db.query(SearchLog)
        .filter(SearchLog.user_id == current_user.id, SearchLog.executed_at == today)
        .count()
    )
    return {"ai_scans": ai_count, "text_searches": text_count, "total": ai_count + text_count}
