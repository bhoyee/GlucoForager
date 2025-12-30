from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.favorite import Favorite
from ...models.user import User
from ..dependencies import get_current_user

router = APIRouter(prefix="/favorites", tags=["favorites"])


class FavoritePayload(BaseModel):
    title: str
    recipe: dict


@router.get("")
def list_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    favorites = db.query(Favorite).filter(Favorite.user_id == current_user.id).order_by(Favorite.created_at.desc()).all()
    return {"items": [{"title": f.title, "recipe": f.recipe, "created_at": f.created_at} for f in favorites]}


@router.post("")
def save_favorite(
    payload: FavoritePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Enforce premium-only favorites
    if current_user.subscription_tier != "premium":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Premium required to save favorites")
    exists = (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id, Favorite.title == payload.title)
        .first()
    )
    if exists:
        return {"detail": "Already saved"}
    fav = Favorite(user_id=current_user.id, title=payload.title, recipe=payload.recipe)
    db.add(fav)
    db.commit()
    return {"detail": "Saved"}
