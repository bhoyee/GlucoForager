from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from calendar import monthrange

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.payroll_item import PayrollItem
from ...models.payroll_run import PayrollRun
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


def _end_of_month(year: int, month: int) -> date:
    days = monthrange(int(year), int(month))[1]
    return date(int(year), int(month), int(days))


class PayrollRunCreatePayload(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)


@router.get("/runs")
def list_runs(
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),  # noqa: ARG001
):
    q = db.query(PayrollRun)
    if year is not None:
        q = q.filter(PayrollRun.year == int(year))
    if month is not None:
        q = q.filter(PayrollRun.month == int(month))
    rows = q.order_by(PayrollRun.year.desc(), PayrollRun.month.desc(), PayrollRun.id.desc()).limit(120).all()
    return {
        "items": [
            {
                "id": r.id,
                "year": r.year,
                "month": r.month,
                "status": r.status,
                "created_by_staff_user_id": r.created_by_staff_user_id,
                "finalized_at": r.finalized_at.isoformat() if r.finalized_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.post("/runs")
def create_run(
    request: Request,
    payload: PayrollRunCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),
):
    existing = db.query(PayrollRun).filter(PayrollRun.year == int(payload.year), PayrollRun.month == int(payload.month)).first()
    if existing:
        return {"ok": True, "id": existing.id}

    run = PayrollRun(
        year=int(payload.year),
        month=int(payload.month),
        status="draft",
        created_by_staff_user_id=int(current_staff.id),
        finalized_at=None,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(run)
    db.flush()
    _audit(
        request,
        db,
        actor_id=int(current_staff.id),
        action="payroll.run.create",
        entity="payroll_runs",
        entity_id=str(run.id),
        details={"year": int(run.year), "month": int(run.month)},
    )
    db.commit()
    return {"ok": True, "id": run.id}


@router.get("/runs/{run_id}")
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),  # noqa: ARG001
):
    run = db.query(PayrollRun).filter(PayrollRun.id == int(run_id)).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return {
        "run": {
            "id": run.id,
            "year": run.year,
            "month": run.month,
            "status": run.status,
            "finalized_at": run.finalized_at.isoformat() if run.finalized_at else None,
            "created_at": run.created_at.isoformat() if run.created_at else None,
        }
    }


@router.get("/runs/{run_id}/items")
def list_run_items(
    run_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),  # noqa: ARG001
):
    run = db.query(PayrollRun).filter(PayrollRun.id == int(run_id)).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    rows = (
        db.query(PayrollItem, StaffUser.email)
        .join(StaffUser, StaffUser.id == PayrollItem.staff_user_id)
        .filter(PayrollItem.run_id == int(run.id))
        .order_by(StaffUser.email.asc(), PayrollItem.id.asc())
        .all()
    )
    return {
        "items": [
            {
                "id": item.id,
                "run_id": item.run_id,
                "staff_user_id": item.staff_user_id,
                "staff_email": email,
                "currency": item.currency,
                "gross": str(item.gross or 0),
                "deductions": str(item.deductions or 0),
                "net": str(item.net or 0),
                "notes": item.notes,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            }
            for item, email in rows
        ]
    }


class GenerateItemsPayload(BaseModel):
    overwrite: bool = False


@router.post("/runs/{run_id}/generate")
def generate_items(
    request: Request,
    run_id: int,
    payload: GenerateItemsPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),
):
    run = db.query(PayrollRun).filter(PayrollRun.id == int(run_id)).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if str(run.status or "").lower() != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Run is not editable")

    existing_count = db.query(func.count(PayrollItem.id)).filter(PayrollItem.run_id == int(run.id)).scalar() or 0
    if existing_count and not payload.overwrite:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Items already exist (use overwrite)")

    if existing_count and payload.overwrite:
        db.query(PayrollItem).filter(PayrollItem.run_id == int(run.id)).delete(synchronize_session=False)

    cutoff = _end_of_month(int(run.year), int(run.month))

    # For each staff member, choose the most recent compensation with effective_from <= cutoff.
    staff_rows = (
        db.query(StaffUser)
        .filter(StaffUser.is_active.is_(True), StaffUser.deleted_at.is_(None))
        .order_by(StaffUser.email.asc())
        .all()
    )

    generated = 0
    missing: list[int] = []

    for staff in staff_rows:
        comp = (
            db.query(StaffCompensation)
            .filter(StaffCompensation.staff_user_id == int(staff.id), StaffCompensation.effective_from <= cutoff)
            .order_by(StaffCompensation.effective_from.desc(), StaffCompensation.id.desc())
            .first()
        )
        if not comp:
            missing.append(int(staff.id))
            continue

        gross = Decimal(comp.monthly_gross or 0).quantize(Decimal("0.01"))
        deductions = Decimal(comp.monthly_deductions_default or 0).quantize(Decimal("0.01"))
        net = (gross - deductions)
        if net < 0:
            net = Decimal("0.00")

        db.add(
            PayrollItem(
                run_id=int(run.id),
                staff_user_id=int(staff.id),
                currency=str(comp.currency or "GBP").strip().upper()[:8] or "GBP",
                gross=gross,
                deductions=deductions,
                net=net.quantize(Decimal("0.01")),
                notes=None,
                created_at=_now(),
                updated_at=_now(),
            )
        )
        generated += 1

    _audit(
        request,
        db,
        actor_id=int(current_staff.id),
        action="payroll.run.generate_items",
        entity="payroll_runs",
        entity_id=str(run.id),
        details={"generated": int(generated), "missing_staff_user_ids": missing, "cutoff": cutoff.isoformat(), "overwrite": bool(payload.overwrite)},
    )
    db.commit()
    return {"ok": True, "generated": int(generated), "missing_staff_user_ids": missing}


class PayrollItemUpdatePayload(BaseModel):
    gross: str | float | int | None = None
    deductions: str | float | int | None = None
    notes: str | None = Field(None, max_length=2000)


@router.patch("/items/{item_id}")
def update_item(
    request: Request,
    item_id: int,
    payload: PayrollItemUpdatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),
):
    item = db.query(PayrollItem).filter(PayrollItem.id == int(item_id)).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    run = db.query(PayrollRun).filter(PayrollRun.id == int(item.run_id)).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    if str(run.status or "").lower() != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Run is not editable")

    before = {"gross": str(item.gross or 0), "deductions": str(item.deductions or 0), "net": str(item.net or 0), "notes": item.notes}

    if payload.gross is not None:
        item.gross = _parse_decimal(payload.gross, field_name="gross")
    if payload.deductions is not None:
        item.deductions = _parse_decimal(payload.deductions, field_name="deductions")
    if payload.notes is not None:
        notes = str(payload.notes).strip()
        item.notes = notes[:2000] if notes else None

    gross = Decimal(item.gross or 0).quantize(Decimal("0.01"))
    deductions = Decimal(item.deductions or 0).quantize(Decimal("0.01"))
    net = gross - deductions
    if net < 0:
        net = Decimal("0.00")
    item.net = net.quantize(Decimal("0.01"))
    item.updated_at = _now()

    _audit(
        request,
        db,
        actor_id=int(current_staff.id),
        action="payroll.item.update",
        entity="payroll_items",
        entity_id=str(item.id),
        details={"before": before, "after": {"gross": str(item.gross), "deductions": str(item.deductions), "net": str(item.net), "notes": item.notes}},
    )
    db.commit()
    return {"ok": True}


@router.post("/runs/{run_id}/finalize")
def finalize_run(
    request: Request,
    run_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),
):
    run = db.query(PayrollRun).filter(PayrollRun.id == int(run_id)).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if str(run.status or "").lower() != "draft":
        return {"ok": True}

    count_items = db.query(func.count(PayrollItem.id)).filter(PayrollItem.run_id == int(run.id)).scalar() or 0
    if not count_items:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Generate items first")

    run.status = "finalized"
    run.finalized_at = _now()
    run.updated_at = _now()

    _audit(
        request,
        db,
        actor_id=int(current_staff.id),
        action="payroll.run.finalize",
        entity="payroll_runs",
        entity_id=str(run.id),
        details={"year": int(run.year), "month": int(run.month), "items": int(count_items)},
    )
    db.commit()
    return {"ok": True}
