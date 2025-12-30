from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...api.dependencies import check_user_access, get_current_user
from ...database import get_db
from ...models.user import SearchLog, User
from ...services.ai_recipe_generator import AIRecipeGenerator
from ...services.ai_vision import AIVisionService

router = APIRouter(prefix="/ai", tags=["ai"])
vision_service = AIVisionService()
recipe_service = AIRecipeGenerator()


class VisionRequest(BaseModel):
    image_base64: str


class RecipeGenRequest(BaseModel):
    ingredients: list[str]


@router.post("/vision")
def analyze_vision(payload: VisionRequest, current_user: User = Depends(get_current_user)):
    if not vision_service.enabled:
        return {"detail": "Vision service not configured; returning mock.", "result": vision_service.analyze_fridge("")}
    return {"result": vision_service.analyze_fridge(payload.image_base64)}


@router.post("/recipes/generate")
def generate_recipes(
    payload: RecipeGenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    access = check_user_access(current_user, db)
    if not access["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily limit reached. Searches left: {access['searches_left']}",
        )

    recipes = recipe_service.generate(payload.ingredients)
    db.add(SearchLog(user_id=current_user.id, query=",".join(payload.ingredients)))
    db.commit()
    return {"results": recipes, "access": access}
