from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...api.dependencies import get_current_user
from ...database import get_db
from ...models.user import User
from ...services.ai_swaps_service import AISwapsService


router = APIRouter(prefix="/app", tags=["app"])


class SwapsRequest(BaseModel):
    food: str = Field(..., min_length=1, max_length=80)
    force_swaps: bool = False


@router.post("/swaps")
def generate_food_swaps(
    payload: SwapsRequest,
    db: Session = Depends(get_db),  # noqa: ARG001
    user: User = Depends(get_current_user),
):
    try:
        service = AISwapsService()
        result = service.generate_swaps(food=payload.food, force_swaps=bool(payload.force_swaps), timeout_seconds=12.0)
        # Do not expose model/provider in the app response.
        return {
            "food": result.get("food"),
            "assessment": result.get("assessment"),
            "should_show_swaps": result.get("should_show_swaps"),
            "swaps": result.get("swaps"),
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception:
        raise HTTPException(status_code=502, detail="Swaps generation failed")
