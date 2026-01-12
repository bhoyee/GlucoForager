import re

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, conlist, constr, validator
from sqlalchemy.orm import Session

from ...api.dependencies import check_user_access, get_current_user
from ...database import get_db
from ...models.user import User
from ...services.ai_pipeline import AIPipeline
from ...services.ingredient_classifier import IngredientClassifier

router = APIRouter(prefix="/ai/text", tags=["ai"])
pipeline = AIPipeline()
classifier = IngredientClassifier()


ALLOWED_INGREDIENT_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9\s\-'/%]*$"

IngredientStr = constr(
    strip_whitespace=True,
    min_length=2,
    max_length=30,
    regex=ALLOWED_INGREDIENT_PATTERN,
)


class TextRecipeRequest(BaseModel):
    ingredients: conlist(IngredientStr, min_items=1, max_items=20)
    filters: list[str] | None = None

    @validator("ingredients", pre=True)
    def normalize_ingredients(cls, value):  # noqa: N805
        if not isinstance(value, list):
            return value
        cleaned = []
        for item in value:
            if not isinstance(item, str):
                continue
            normalized = " ".join(item.split())
            if normalized:
                cleaned.append(normalized)
        return cleaned

    @validator("ingredients")
    def reject_invalid_ingredients(cls, value):  # noqa: N805
        invalid = [item for item in value if not re.match(ALLOWED_INGREDIENT_PATTERN, item)]
        if invalid:
            raise ValueError(
                "Ingredients can only include letters, numbers, spaces, hyphens, apostrophes, slashes, or %."
            )
        return value


@router.post("/recipes")
def generate_from_text(
    payload: TextRecipeRequest,
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
    tier = current_user.subscription_tier or "free"
    classified = classifier.classify(payload.ingredients)
    if not classified["food"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Content not related to food. Please enter real ingredients.",
        )
    ingredients = classified["food"]
    try:
        recipes = pipeline.text_to_recipes(
            db,
            current_user.id,
            tier,
            ingredients,
            filters=payload.filters or [],
            device_id=device_id,
        )
    except RuntimeError as exc:
        # AI not configured (missing keys) or other pipeline errors
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return {
        "results": recipes,
        "access": access,
        "filtered_out": classified["non_food"],
        "classification_source": classified["source"],
    }
