from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...api.dependencies import check_user_access, get_current_user
from ...database import get_db
from ...models.recipe import Recipe
from ...models.user import SearchLog, User
from ...services.recipe_matcher import find_diabetes_recipes

router = APIRouter(prefix="/recipes", tags=["recipes"])


class RecipeSearchRequest(BaseModel):
    ingredients: list[str]


@router.post("/search")
def search_recipes(
    payload: RecipeSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    access = check_user_access(current_user, db)
    if not access["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily limit reached. Searches left: {access['searches_left']}",
        )

    recipes = db.query(Recipe).all()
    matches = find_diabetes_recipes(payload.ingredients, recipes)

    db.add(SearchLog(user_id=current_user.id, query=",".join(payload.ingredients)))
    db.commit()

    return {
        "results": [
            {
                "id": item["recipe"].id,
                "title": item["recipe"].title,
                "match_score": item["match_score"],
                "missing_ingredients": item["missing_ingredients"],
                "glycemic_index": item["recipe"].glycemic_index,
                "total_time": item["recipe"].total_time,
                "tags": item["recipe"].tags,
            }
            for item in matches
        ],
        "access": access,
    }
