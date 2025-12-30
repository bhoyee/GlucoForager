from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...api.dependencies import check_user_access, get_current_user
from ...database import get_db
from ...models.user import User
from ...services.ai_pipeline import AIPipeline

router = APIRouter(prefix="/ai/recipes", tags=["ai"])
pipeline = AIPipeline()


class VisionRecipeRequest(BaseModel):
    image_base64: str
    filters: list[str] | None = None


@router.post("/vision")
def generate_from_vision(
    payload: VisionRecipeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    access = check_user_access(current_user, db)
    if not access["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily limit reached. Scans left: {access['searches_left']}",
        )
    tier = current_user.subscription_tier or "free"
    recipes = pipeline.fridge_to_recipes(db, current_user.id, tier, payload.image_base64, filters=payload.filters or [])
    return {"results": recipes, "access": access}
