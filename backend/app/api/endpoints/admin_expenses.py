from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.staff_expense import StaffExpense
from ...models.staff_user import StaffUser


router = APIRouter(prefix="/admin/expenses", tags=["admin-expenses"])


class ExpenseCreatePayload(BaseModel):
    expense_date: date
    amount: float = Field(..., gt=0, le=1_000_000)
    currency: str = Field("GBP", max_length=8)
    category: str = Field("general", max_length=64)
    note: str | None = Field(None, max_length=240)


@router.get("")
def list_expenses(
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),  # noqa: ARG001
):
    q = db.query(StaffExpense)
    if year and month:
        start = date(int(year), int(month), 1)
        if int(month) == 12:
            end = date(int(year) + 1, 1, 1)
        else:
            end = date(int(year), int(month) + 1, 1)
        q = q.filter(StaffExpense.expense_date >= start, StaffExpense.expense_date < end)
    q = q.order_by(StaffExpense.expense_date.desc(), StaffExpense.id.desc())
    rows = q.limit(500).all()
    return {
        "items": [
            {
                "id": r.id,
                "expense_date": r.expense_date.isoformat(),
                "amount": float(r.amount),
                "currency": r.currency,
                "category": r.category,
                "note": r.note,
                "created_by_staff_user_id": r.created_by_staff_user_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.post("")
def create_expense(
    payload: ExpenseCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),
):
    row = StaffExpense(
        created_by_staff_user_id=current_staff.id,
        expense_date=payload.expense_date,
        amount=payload.amount,
        currency=(payload.currency or "GBP").strip().upper()[:8] or "GBP",
        category=(payload.category or "general").strip().lower()[:64] or "general",
        note=(payload.note.strip()[:240] if payload.note else None),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id}


@router.delete("/{expense_id}")
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),
):
    row = db.query(StaffExpense).filter(StaffExpense.id == int(expense_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    # MVP: only allow creator to delete (admin override can come later).
    if int(row.created_by_staff_user_id) != int(current_staff.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    db.delete(row)
    db.commit()
    return {"ok": True}

