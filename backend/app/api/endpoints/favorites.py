from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.favorite import Favorite
from ...models.user import User
from ...services.user_activity_service import add_user_activity
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
    return {
        "items": [
            {"id": f.id, "title": f.title, "recipe": f.recipe, "created_at": f.created_at}
            for f in favorites
        ]
    }


@router.post("")
def save_favorite(
    payload: FavoritePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total = db.query(func.count(Favorite.id)).filter(Favorite.user_id == current_user.id).scalar() or 0
    if total >= 20:
        oldest = (
            db.query(Favorite)
            .filter(Favorite.user_id == current_user.id)
            .order_by(Favorite.created_at.asc())
            .first()
        )
        if oldest:
            db.delete(oldest)
            db.commit()
    exists = (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id, Favorite.title == payload.title)
        .first()
    )
    if exists:
        return {"detail": "Already saved"}
    fav = Favorite(user_id=current_user.id, title=payload.title, recipe=payload.recipe)
    db.add(fav)
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type="favorite.saved",
        label="Saved a recipe",
        source="mobile",
        metadata={"title": payload.title},
    )
    db.commit()
    return {"detail": "Saved"}


@router.delete("/{favorite_id}")
def delete_favorite(
    favorite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    favorite = (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id, Favorite.id == favorite_id)
        .first()
    )
    if not favorite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Favorite not found")
    title = favorite.title
    db.delete(favorite)
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type="favorite.deleted",
        label="Removed a saved recipe",
        source="mobile",
        metadata={"title": title},
    )
    db.commit()
    return {"detail": "Deleted"}
