from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_compensation import StaffCompensation
from ...models.staff_user import StaffUser


router = APIRouter(prefix="/admin/payroll", tags=["admin-payroll"])


def _now() -> datetime:
    return datetime.utcnow()


def _parse_decimal(value: str | int | float | Decimal | None, *, field_name: str) -> Decimal:
    if value is None:
        return Decimal("0")
    try:
        dec = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid {field_name}")
    if dec.is_nan() or dec.is_infinite():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid {field_name}")
    if dec < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} must be >= 0")
    # Clamp to 2dp to avoid messy floats from UI.
    return dec.quantize(Decimal("0.01"))


def _parse_date(value: str | None) -> date:
    if not value:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="effective_from is required")
    try:
        return date.fromisoformat(str(value))
    except Exception:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid effective_from date")


def _audit(
    request: Request,
    db: Session,
    *,
    actor_id: int,
    action: str,
    entity: str,
    entity_id: str | None,
    details: dict | None,
) -> None:
    db.add(
        StaffAuditLog(
            actor_id=int(actor_id),
            action=str(action)[:80],
            entity=str(entity)[:80],
            entity_id=(str(entity_id)[:120] if entity_id else None),
            details=details,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=_now(),
        )
    )


class CompensationUpsertPayload(BaseModel):
    staff_user_id: int
    currency: str = Field("GBP", min_length=1, max_length=8)
    monthly_gross: str | float | int = Field(..., description="Monthly gross amount")
    monthly_deductions_default: str | float | int = Field(0, description="Default monthly deductions")
    effective_from: str = Field(..., description="YYYY-MM-DD")


@router.get("/compensation")
def list_compensation(
    staff_user_id: int | None = None,
    include_inactive: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),  # noqa: ARG001
):
    q = db.query(StaffCompensation)
    if staff_user_id is not None:
        q = q.filter(StaffCompensation.staff_user_id == int(staff_user_id))
    if not include_inactive:
        q = q.filter(StaffCompensation.is_active.is_(True))
    rows = q.order_by(StaffCompensation.staff_user_id.asc(), StaffCompensation.effective_from.desc(), StaffCompensation.id.desc()).all()
    return {
        "items": [
            {
                "id": r.id,
                "staff_user_id": r.staff_user_id,
                "currency": r.currency,
                "monthly_gross": str(r.monthly_gross or 0),
                "monthly_deductions_default": str(r.monthly_deductions_default or 0),
                "effective_from": r.effective_from.isoformat() if r.effective_from else None,
                "is_active": bool(r.is_active),
                "created_by_staff_user_id": r.created_by_staff_user_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
    }


@router.post("/compensation")
def upsert_compensation(
    request: Request,
    payload: CompensationUpsertPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),
):
    staff = db.query(StaffUser).filter(StaffUser.id == int(payload.staff_user_id)).first()
    if not staff or getattr(staff, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")

    currency = str(payload.currency or "").strip().upper()[:8]
    if not currency:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Currency is required")

    gross = _parse_decimal(payload.monthly_gross, field_name="monthly_gross")
    deductions_default = _parse_decimal(payload.monthly_deductions_default, field_name="monthly_deductions_default")
    effective_from = _parse_date(payload.effective_from)

    # Disable previous active compensations for this staff (history retained).
    db.query(StaffCompensation).filter(
        StaffCompensation.staff_user_id == int(staff.id),
        StaffCompensation.is_active.is_(True),
    ).update({"is_active": False, "updated_at": _now()}, synchronize_session=False)

    row = StaffCompensation(
        staff_user_id=int(staff.id),
        currency=currency,
        monthly_gross=gross,
        monthly_deductions_default=deductions_default,
        effective_from=effective_from,
        is_active=True,
        created_by_staff_user_id=int(current_staff.id),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(row)
    db.flush()

    _audit(
        request,
        db,
        actor_id=int(current_staff.id),
        action="payroll.compensation.set",
        entity="staff_compensation",
        entity_id=str(row.id),
        details={
            "staff_user_id": int(staff.id),
            "currency": currency,
            "monthly_gross": str(gross),
            "monthly_deductions_default": str(deductions_default),
            "effective_from": effective_from.isoformat(),
        },
    )

    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id}


@router.post("/compensation/{comp_id}/disable")
def disable_compensation(
    request: Request,
    comp_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),
):
    row = db.query(StaffCompensation).filter(StaffCompensation.id == int(comp_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not row.is_active:
        return {"ok": True}

    row.is_active = False
    row.updated_at = _now()
    _audit(
        request,
        db,
        actor_id=int(current_staff.id),
        action="payroll.compensation.disable",
        entity="staff_compensation",
        entity_id=str(row.id),
        details={"staff_user_id": int(row.staff_user_id)},
    )
    db.commit()
    return {"ok": True}

