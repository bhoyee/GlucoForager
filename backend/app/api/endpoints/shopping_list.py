from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.shopping_item import ShoppingItem
from ...models.user import User
from ...services.user_activity_service import add_user_activity
from ..dependencies import get_current_user

router = APIRouter(prefix="/shopping-list", tags=["shopping-list"])


class ShoppingListPayload(BaseModel):
    title: str
    items: list[str]


class ShoppingListItemsPayload(BaseModel):
    items: list[str]


@router.get("")
def list_shopping(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(ShoppingItem)
        .filter(ShoppingItem.user_id == current_user.id)
        .order_by(ShoppingItem.created_at.desc())
        .limit(50)
        .all()
    )
    return {"items": [{"id": r.id, "title": r.title, "items": r.items, "created_at": r.created_at} for r in rows]}


@router.post("")
def create_shopping_list(
    payload: ShoppingListPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = ShoppingItem(user_id=current_user.id, title=payload.title, items=payload.items)
    db.add(row)
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type="shopping_list.created",
        label="Created a shopping list",
        source="mobile",
        metadata={"title": payload.title, "item_count": len(payload.items or [])},
    )
    db.commit()
    return {"detail": "Created", "id": row.id}


@router.patch("/{shopping_list_id}")
def update_shopping_list(
    shopping_list_id: int,
    payload: ShoppingListItemsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(ShoppingItem)
        .filter(ShoppingItem.user_id == current_user.id, ShoppingItem.id == shopping_list_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shopping list not found")
    row.items = payload.items
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type="shopping_list.updated",
        label="Updated a shopping list",
        source="mobile",
        metadata={"title": row.title, "item_count": len(payload.items or [])},
    )
    db.commit()
    return {"detail": "Updated"}


@router.delete("/{shopping_list_id}")
def delete_shopping_list(
    shopping_list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(ShoppingItem)
        .filter(ShoppingItem.user_id == current_user.id, ShoppingItem.id == shopping_list_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shopping list not found")
    title = row.title
    db.delete(row)
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type="shopping_list.deleted",
        label="Removed a shopping list",
        source="mobile",
        metadata={"title": title},
    )
    db.commit()
    return {"detail": "Deleted"}
