from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...api.dependencies import check_user_access, get_current_user
from ...database import get_db
from ...models.user import SearchLog, User
from ...services.ai_recipe_generator import AIRecipeGenerator
from ...services.ai_vision import AIVisionService
from ...services.cost_tracker import record_ai_request
from ...services.subscription_service import get_effective_subscription_tier
from ...services.user_activity_service import add_user_activity

router = APIRouter(prefix="/ai", tags=["ai"])
vision_service = AIVisionService()
recipe_service = AIRecipeGenerator()


class VisionRequest(BaseModel):
    image_base64: str


class RecipeGenRequest(BaseModel):
    ingredients: list[str]


@router.post("/vision")
def analyze_vision(
    payload: VisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    device_id: str = Header(..., alias="X-Device-Id"),
):
    access = check_user_access(current_user, db, device_id)
    if not access["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily limit reached. Scans left: {access['searches_left']}",
        )
    if not vision_service.enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Vision service not configured")
    try:
        result = vision_service.analyze_fridge(payload.image_base64)
        tier = get_effective_subscription_tier(db, current_user) or "free"
        record_ai_request(db, current_user.id, tier, "vision", model_used=tier, tokens_used=0, cost_estimate=0, device_id=device_id)
        return {"result": result, "access": access}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post("/recipes/generate")
def generate_recipes(
    payload: RecipeGenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    device_id: str = Header(..., alias="X-Device-Id"),
):
    access = check_user_access(current_user, db, device_id)
    if not access["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily limit reached. Searches left: {access['searches_left']}",
        )

    if not recipe_service.enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Recipe AI not configured")
    try:
        tier = get_effective_subscription_tier(db, current_user) or "free"
        recipes = recipe_service.generate(payload.ingredients, tier=tier, generate_images=False)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    query = ",".join(payload.ingredients)
    db.add(SearchLog(user_id=current_user.id, device_id=device_id, query=query))
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type="recipe.search",
        label="Generated recipes from ingredients",
        source="mobile",
        metadata={"ingredients_count": len(payload.ingredients or []), "query": query[:160]},
    )
    db.commit()
    return {"results": recipes, "access": access}
