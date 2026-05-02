from fastapi import APIRouter, Depends
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
