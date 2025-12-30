from datetime import date
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.meal_plan import MealPlan
from ...models.user import User
from ..dependencies import get_current_user

router = APIRouter(prefix="/meal-plans", tags=["meal-plans"])


class MealPlanPayload(BaseModel):
    plan_date: date
    recipes: list[dict]


@router.get("")
def list_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plans = (
        db.query(MealPlan)
        .filter(MealPlan.user_id == current_user.id)
        .order_by(MealPlan.plan_date.desc())
        .limit(20)
        .all()
    )
    return {"items": [{"id": p.id, "plan_date": p.plan_date, "recipes": p.recipes} for p in plans]}


@router.post("")
def create_plan(
    payload: MealPlanPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = MealPlan(user_id=current_user.id, plan_date=payload.plan_date, recipes=payload.recipes)
    db.add(plan)
    db.commit()
    return {"detail": "Created", "id": plan.id}
