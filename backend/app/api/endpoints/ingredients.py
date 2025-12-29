from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/ingredients", tags=["ingredients"])


class IngredientPayload(BaseModel):
    name: str
    quantity: float | None = None
    unit: str | None = None


@router.post("/check")
def check_ingredients(payload: list[IngredientPayload]):
    # Placeholder safety check. Extend with glycemic index lookup.
    sanitized = []
    for item in payload:
        sanitized.append(
            {"name": item.name.strip().lower(), "quantity": item.quantity, "unit": item.unit, "safe_for_diabetes": True}
        )
    return {"items": sanitized}
