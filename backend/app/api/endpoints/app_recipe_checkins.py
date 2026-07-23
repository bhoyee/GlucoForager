from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.recipe_check_in import RecipeCheckIn
from ...models.user import User
from ...services.recipe_fingerprint import recipe_fingerprint
from ...services.user_activity_service import add_user_activity
from ..dependencies import get_current_user

router = APIRouter(prefix="/app", tags=["app"])


class RecipeCheckInPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    ingredients: list[str] = Field(default_factory=list, max_length=50)
    feeling: Literal["great", "ok", "not_great"]


@router.post("/recipes/check-in")
def create_recipe_check_in(
    payload: RecipeCheckInPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fingerprint = recipe_fingerprint(title=payload.title, ingredients=payload.ingredients)
    today = datetime.utcnow().date()

    existing = (
        db.query(RecipeCheckIn)
        .filter(
            RecipeCheckIn.user_id == current_user.id,
            RecipeCheckIn.recipe_fingerprint == fingerprint,
            RecipeCheckIn.check_in_date == today,
        )
        .first()
    )
    if existing:
        existing.feeling = payload.feeling
    else:
        db.add(
            RecipeCheckIn(
                user_id=current_user.id,
                recipe_fingerprint=fingerprint,
                recipe_name=payload.title,
                feeling=payload.feeling,
                check_in_date=today,
            )
        )
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type="recipe.check_in",
        label="Logged how a recipe made them feel",
        source="mobile",
        metadata={"title": payload.title, "feeling": payload.feeling},
    )
    db.commit()
    return {"detail": "Logged"}


def get_latest_feelings(db: Session, user_id: int, fingerprints: list[str]) -> dict[str, str]:
    """Latest logged feeling per recipe fingerprint, for reranking/badges elsewhere."""
    unique_fingerprints = [fp for fp in dict.fromkeys(fingerprints) if fp]
    if not unique_fingerprints:
        return {}
    rows = (
        db.query(RecipeCheckIn)
        .filter(
            RecipeCheckIn.user_id == user_id,
            RecipeCheckIn.recipe_fingerprint.in_(unique_fingerprints),
        )
        .order_by(RecipeCheckIn.check_in_date.desc())
        .all()
    )
    result: dict[str, str] = {}
    for row in rows:
        result.setdefault(row.recipe_fingerprint, row.feeling)
    return result


def get_disliked_recipe_names(db: Session, user_id: int, limit: int = 15) -> list[str]:
    """Recent recipe names the user marked "not_great", for steering future generations away from them."""
    rows = (
        db.query(RecipeCheckIn)
        .filter(RecipeCheckIn.user_id == user_id, RecipeCheckIn.feeling == "not_great")
        .order_by(RecipeCheckIn.check_in_date.desc())
        .all()
    )
    names: list[str] = []
    seen: set[str] = set()
    for row in rows:
        name = (row.recipe_name or "").strip()
        key = name.lower()
        if not name or key in seen:
            continue
        seen.add(key)
        names.append(name)
        if len(names) >= limit:
            break
    return names


@router.get("/recipes/check-in/today")
def get_recipe_check_in_today(
    title: str,
    ingredients: list[str] = Query(default_factory=list),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fingerprint = recipe_fingerprint(title=title, ingredients=ingredients)
    today = datetime.utcnow().date()
    existing = (
        db.query(RecipeCheckIn)
        .filter(
            RecipeCheckIn.user_id == current_user.id,
            RecipeCheckIn.recipe_fingerprint == fingerprint,
            RecipeCheckIn.check_in_date == today,
        )
        .first()
    )
    return {"feeling": existing.feeling if existing else None}
