from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...api.dependencies import get_current_user
from ...database import get_db
from ...models.user import User
from ...services.daily_challenge_service import get_challenge_view, set_task_completed


router = APIRouter(prefix="/app", tags=["app"])


class ChallengeCompletePayload(BaseModel):
    task_id: str = Field(..., min_length=1, max_length=80)
    completed: bool = True
    force_undo: bool = False


@router.get("/challenge/today")
def get_today_challenge(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"challenge": get_challenge_view(db, user=user)}


@router.post("/challenge/complete")
def complete_challenge_task(
    payload: ChallengeCompletePayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        view = set_task_completed(
            db,
            user=user,
            task_id=payload.task_id,
            completed=bool(payload.completed),
            force_undo=bool(payload.force_undo),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {"challenge": view}
