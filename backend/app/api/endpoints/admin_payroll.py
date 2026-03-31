from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from calendar import monthrange
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...core.config import settings
from ...models.payroll_item import PayrollItem
from ...models.payroll_run import PayrollRun
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_compensation import StaffCompensation
from ...models.staff_user import StaffUser
from ...services.email_service import send_staff_payroll_available_email

import html
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


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


def _payslip_ref(*, brand: str, year: int, month: int, item_id: int) -> str:
    b = str(brand or "").strip().lower()
    prefix = "GF" if "glucoforager" in b else "".join([w[:1].upper() for w in str(brand or "").split() if w][:3]) or "PAY"
    return f"{prefix}-PSL-{int(year)}{int(month):02d}-{int(item_id):06d}"


class PayrollRunCreatePayload(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    pay_date: str | None = Field(None, description="Optional pay date (YYYY-MM-DD). Defaults to last day of month.")


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
                "pay_date": r.pay_date.isoformat() if getattr(r, "pay_date", None) else None,
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

    pay_date = None
    if payload.pay_date:
        try:
            pay_date = date.fromisoformat(str(payload.pay_date))
        except Exception:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid pay_date")
    if not pay_date:
        pay_date = _end_of_month(int(payload.year), int(payload.month))

    run = PayrollRun(
        year=int(payload.year),
        month=int(payload.month),
        status="draft",
        created_by_staff_user_id=int(current_staff.id),
        finalized_at=None,
        pay_date=pay_date,
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


class PayrollRunPayDatePayload(BaseModel):
    pay_date: str = Field(..., description="YYYY-MM-DD")


@router.post("/runs/{run_id}/pay-date")
def set_run_pay_date(
    request: Request,
    run_id: int,
    payload: PayrollRunPayDatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),
):
    run = db.query(PayrollRun).filter(PayrollRun.id == int(run_id)).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    try:
        pay_date = date.fromisoformat(str(payload.pay_date))
    except Exception:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid pay_date")

    run.pay_date = pay_date
    run.updated_at = _now()
    _audit(
        request,
        db,
        actor_id=int(current_staff.id),
        action="payroll.run.pay_date.set",
        entity="payroll_runs",
        entity_id=str(run.id),
        details={"pay_date": pay_date.isoformat()},
    )
    db.commit()
    return {"ok": True, "pay_date": pay_date.isoformat()}


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
            "pay_date": run.pay_date.isoformat() if getattr(run, "pay_date", None) else None,
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
                "payslip_ref": _payslip_ref(
                    brand=str(settings.payroll_brand_name or "GlucoForager"),
                    year=int(run.year),
                    month=int(run.month),
                    item_id=int(item.id),
                ),
                "currency": item.currency,
                "gross": str(item.gross or 0),
                "deductions": str(item.deductions or 0),
                "net": str(item.net or 0),
                "notes": item.notes,
                "emailed_at": item.emailed_at.isoformat() if getattr(item, "emailed_at", None) else None,
                "emailed_by_staff_user_id": getattr(item, "emailed_by_staff_user_id", None),
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            }
            for item, email in rows
        ]
    }


@router.get("/runs/{run_id}/summary")
def run_summary(
    run_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),  # noqa: ARG001
):
    run = db.query(PayrollRun).filter(PayrollRun.id == int(run_id)).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    rows = (
        db.query(
            PayrollItem.currency.label("currency"),
            func.count(PayrollItem.id).label("count_items"),
            func.coalesce(func.sum(PayrollItem.gross), 0).label("sum_gross"),
            func.coalesce(func.sum(PayrollItem.deductions), 0).label("sum_deductions"),
            func.coalesce(func.sum(PayrollItem.net), 0).label("sum_net"),
        )
        .filter(PayrollItem.run_id == int(run.id))
        .group_by(PayrollItem.currency)
        .order_by(PayrollItem.currency.asc())
        .all()
    )

    totals = []
    for r in rows:
        totals.append(
            {
                "currency": str(r.currency or ""),
                "count_items": int(r.count_items or 0),
                "gross": str(r.sum_gross or 0),
                "deductions": str(r.sum_deductions or 0),
                "net": str(r.sum_net or 0),
            }
        )

    return {"run_id": int(run.id), "year": int(run.year), "month": int(run.month), "totals": totals}


@router.get("/runs/{run_id}/export.csv")
def export_run_csv(
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

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "year",
            "month",
            "run_id",
            "run_status",
            "pay_date",
            "staff_user_id",
            "staff_email",
            "payslip_ref",
            "currency",
            "gross",
            "deductions",
            "net",
            "notes",
            "emailed_at",
        ]
    )

    pay_date = getattr(run, "pay_date", None) or _end_of_month(int(run.year), int(run.month))

    for item, email in rows:
        writer.writerow(
            [
                int(run.year),
                int(run.month),
                int(run.id),
                str(run.status or ""),
                pay_date.isoformat(),
                int(item.staff_user_id),
                str(email or ""),
                _payslip_ref(
                    brand=str(settings.payroll_brand_name or "GlucoForager"),
                    year=int(run.year),
                    month=int(run.month),
                    item_id=int(item.id),
                ),
                str(item.currency or ""),
                str(item.gross or 0),
                str(item.deductions or 0),
                str(item.net or 0),
                str(item.notes or ""),
                (item.emailed_at.isoformat() if getattr(item, "emailed_at", None) else ""),
            ]
        )

    csv_text = buffer.getvalue()
    filename = f"payroll_{int(run.year)}_{str(int(run.month)).zfill(2)}_run_{int(run.id)}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([csv_text]), media_type="text/csv; charset=utf-8", headers=headers)


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


class SendEmailsPayload(BaseModel):
    resend: bool = False


@router.post("/runs/{run_id}/send-emails")
def send_payroll_emails(
    request: Request,
    run_id: int,
    payload: SendEmailsPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.manage")),
):
    run = db.query(PayrollRun).filter(PayrollRun.id == int(run_id)).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if str(run.status or "").lower() != "finalized":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Finalize the run before sending emails")

    rows = (
        db.query(PayrollItem, StaffUser.email)
        .join(StaffUser, StaffUser.id == PayrollItem.staff_user_id)
        .filter(PayrollItem.run_id == int(run.id))
        .order_by(StaffUser.email.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No payroll items")

    period_label = f"{int(run.year)}-{str(int(run.month)).zfill(2)}"
    # Best-effort portal link; uses SITE_URL as base (can be your admin domain).
    base = str(getattr(settings, "site_url", "") or "").rstrip("/")
    portal_url = f"{base}/admin/my-payroll" if base else None

    sent = 0
    skipped = 0
    failed: list[dict] = []

    for item, email in rows:
        if not payload.resend and getattr(item, "emailed_at", None) is not None:
            skipped += 1
            continue
        if not email:
            failed.append({"item_id": int(item.id), "error": "Missing email"})
            continue
        try:
            send_staff_payroll_available_email(to_email=str(email), period_label=period_label, portal_url=portal_url)
            item.emailed_at = _now()
            item.emailed_by_staff_user_id = int(current_staff.id)
            item.updated_at = _now()
            sent += 1
        except Exception as exc:  # noqa: BLE001
            failed.append({"item_id": int(item.id), "error": str(exc)[:160]})

    _audit(
        request,
        db,
        actor_id=int(current_staff.id),
        action="payroll.run.send_emails",
        entity="payroll_runs",
        entity_id=str(run.id),
        details={"sent": int(sent), "skipped": int(skipped), "failed": failed[:40], "resend": bool(payload.resend)},
    )
    db.commit()
    return {"ok": True, "sent": int(sent), "skipped": int(skipped), "failed": failed}


@router.get("/my/items")
def list_my_payroll_items(
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.read_own")),
):
    q = (
        db.query(PayrollItem, PayrollRun.year, PayrollRun.month, PayrollRun.status, PayrollRun.finalized_at, PayrollRun.pay_date)
        .join(PayrollRun, PayrollRun.id == PayrollItem.run_id)
        .filter(PayrollItem.staff_user_id == int(current_staff.id))
    )
    if year is not None:
        q = q.filter(PayrollRun.year == int(year))
    if month is not None:
        q = q.filter(PayrollRun.month == int(month))
    rows = q.order_by(PayrollRun.year.desc(), PayrollRun.month.desc(), PayrollRun.id.desc(), PayrollItem.id.asc()).all()

    return {
        "items": [
            {
                "id": item.id,
                "run_id": item.run_id,
                "year": int(r_year),
                "month": int(r_month),
                "run_status": str(r_status or ""),
                "finalized_at": r_finalized_at.isoformat() if r_finalized_at else None,
                "pay_date": (r_pay_date.isoformat() if r_pay_date else _end_of_month(int(r_year), int(r_month)).isoformat()),
                "payslip_ref": _payslip_ref(
                    brand=str(settings.payroll_brand_name or "GlucoForager"),
                    year=int(r_year),
                    month=int(r_month),
                    item_id=int(item.id),
                ),
                "currency": item.currency,
                "gross": str(item.gross or 0),
                "deductions": str(item.deductions or 0),
                "net": str(item.net or 0),
                "notes": item.notes,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            }
            for item, r_year, r_month, r_status, r_finalized_at, r_pay_date in rows
        ]
    }


def _money(currency: str, value: Decimal | str | int | float | None) -> str:
    cur = str(currency or "").upper() or "—"
    try:
        dec = Decimal(str(value or 0)).quantize(Decimal("0.01"))
    except Exception:
        dec = Decimal("0.00")
    return f"{cur} {dec}"


def _escape(text: str | None) -> str:
    return html.escape(str(text or "").strip())


def _draw_pdf_logo_watermark(*, canvas, doc, logo_path: str) -> None:  # noqa: ANN001
    path = str(logo_path or "").strip()
    if not path:
        return
    try:
        reader = ImageReader(path)
        iw, ih = reader.getSize()
        if not iw or not ih:
            return
        page_w, page_h = doc.pagesize
        # Keep a large-but-subtle watermark.
        max_w = page_w * 0.72
        max_h = page_h * 0.72
        scale = min(max_w / float(iw), max_h / float(ih))
        w = float(iw) * scale
        h = float(ih) * scale
        x = (page_w - w) / 2.0
        y = (page_h - h) / 2.0

        canvas.saveState()
        try:
            if hasattr(canvas, "setFillAlpha"):
                canvas.setFillAlpha(0.06)
        except Exception:
            pass
        canvas.drawImage(reader, x, y, width=w, height=h, mask="auto", preserveAspectRatio=True, anchor="c")
        canvas.restoreState()
    except Exception:
        return


@router.get("/my/items/{item_id}/payslip.pdf")
def my_payslip_pdf(
    item_id: int,
    download: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("payroll.read_own")),
):
    row = (
        db.query(PayrollItem, PayrollRun)
        .join(PayrollRun, PayrollRun.id == PayrollItem.run_id)
        .filter(PayrollItem.id == int(item_id), PayrollItem.staff_user_id == int(current_staff.id))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payslip not found")
    item, run = row

    buf = io.BytesIO()

    holding = str(settings.payroll_holding_name or "Bhoyee Global Enterprise").strip() or "Bhoyee Global Enterprise"
    brand = str(settings.payroll_brand_name or "GlucoForager").strip() or "GlucoForager"
    brand_website = str(getattr(settings, "payroll_brand_website", "") or "").strip() or "https://glucoforager.com"
    logo_path = str(getattr(settings, "payroll_logo_path", "") or "").strip()
    period = f"{int(run.year)}-{int(run.month):02d}"
    period_label = date(int(run.year), int(run.month), 1).strftime("%B %Y")
    staff_name = (getattr(current_staff, "full_name", None) or current_staff.email or "").strip()
    pay_date = getattr(run, "pay_date", None) or _end_of_month(int(run.year), int(run.month))
    pay_date_label = pay_date.strftime("%d %b %Y")
    payslip_id = _payslip_ref(brand=brand, year=int(run.year), month=int(run.month), item_id=int(item.id))

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Payslip {period}",
        author=holding,
    )

    styles = getSampleStyleSheet()
    brand_blue = colors.HexColor("#2563eb")
    ink = colors.HexColor("#0f172a")
    muted = colors.HexColor("#475569")
    line = colors.HexColor("#cbd5e1")

    styles.add(ParagraphStyle(name="GFTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=ink))
    styles.add(ParagraphStyle(name="GFSub", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=12, textColor=muted))
    styles.add(ParagraphStyle(name="GFSection", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=9.5, leading=12, textColor=brand_blue, spaceAfter=2))
    styles.add(ParagraphStyle(name="GFLabel", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, leading=11, textColor=muted))
    styles.add(ParagraphStyle(name="GFValue", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=11.5, textColor=ink))
    styles.add(ParagraphStyle(name="GFValueBold", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=10.5, leading=12, textColor=ink))
    styles.add(ParagraphStyle(name="GFBrand", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=12, leading=14, textColor=ink))
    styles.add(ParagraphStyle(name="GFWebsite", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=12, textColor=muted))

    def kv_table(rows: list[tuple[str, str]]) -> Table:
        data = [[Paragraph(_escape(k), styles["GFLabel"]), Paragraph(_escape(v), styles["GFValue"])] for k, v in rows]
        t = Table(data, colWidths=[40 * mm, 75 * mm])
        t.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        return t

    # Header lines (optional)
    company_lines: list[str] = []
    if settings.payroll_company_address:
        company_lines.append(str(settings.payroll_company_address).strip())
    meta_parts = [
        (str(settings.payroll_company_email).strip() if settings.payroll_company_email else ""),
        (str(settings.payroll_company_phone).strip() if settings.payroll_company_phone else ""),
        (f"Reg: {str(settings.payroll_company_reg_no).strip()}" if settings.payroll_company_reg_no else ""),
    ]
    meta_line = " · ".join([p for p in meta_parts if p])
    if meta_line:
        company_lines.append(meta_line)

    gross = _money(item.currency, item.gross)
    ded = _money(item.currency, item.deductions)
    net = _money(item.currency, item.net)

    # Header (match reference image structure)
    generated_label = datetime.utcnow().strftime("%d %b %Y %H:%M UTC")
    header_left = [
        Paragraph(_escape(holding), styles["GFTitle"]),
        Paragraph(_escape(f"Brand: {brand}"), styles["GFBrand"]),
        Paragraph(_escape(brand_website), styles["GFWebsite"]),
        Paragraph(_escape(" ".join([x for x in company_lines if x]) or ""), styles["GFSub"]),
        Spacer(1, 6),
        Paragraph(_escape(f"Payslip for the month of {period_label}"), styles["GFValueBold"]),
    ]
    header_left_box = Table([[c] for c in header_left], colWidths=[120 * mm])
    header_left_box.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))

    net_box = Table(
        [
            [Paragraph("Employee Net Pay", styles["GFLabel"])],
            [Paragraph(_escape(net), ParagraphStyle(name="GFNet", parent=styles["GFValueBold"], fontSize=14, textColor=ink))],
        ],
        colWidths=[55 * mm],
    )
    net_box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.8, line),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("ALIGN", (0, 1), (0, 1), "RIGHT"),
            ]
        )
    )

    header = Table([[header_left_box, net_box]], colWidths=[125 * mm, 55 * mm])
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )

    story: list = [header]
    top_line = Table([[""]], colWidths=[180 * mm], rowHeights=[1])
    top_line.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), line)]))
    story.append(top_line)
    story.append(Spacer(1, 10))

    # Employee pay summary (like reference)
    summary_left = kv_table(
        [
            ("Employee Name", staff_name or "—"),
            ("Employee Email", str(current_staff.email or "—")),
            ("Pay Period", period_label),
            ("Payslip ID", payslip_id),
        ]
    )
    summary_right = kv_table(
        [
            ("Pay Date", pay_date_label),
            ("Finalized At", (run.finalized_at.isoformat(sep=" ", timespec="minutes") if run.finalized_at else "—")),
            ("Currency", str(item.currency or "—")),
        ]
    )
    summary = Table(
        [
            [Paragraph("EMPLOYEE PAY SUMMARY", styles["GFSection"]), ""],
            [summary_left, summary_right],
        ],
        colWidths=[90 * mm, 90 * mm],
    )
    summary.setStyle(
        TableStyle(
            [
                ("SPAN", (0, 0), (-1, 0)),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                ("VALIGN", (0, 1), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(summary)
    story.append(Spacer(1, 10))

    def section_table(*, title: str, rows: list[tuple[str, str]]) -> Table:
        data = [[Paragraph(_escape(title), styles["GFSection"]), "", ""]]
        data.append([Paragraph("Description", styles["GFLabel"]), Paragraph("Amount", styles["GFLabel"]), Paragraph("YTD", styles["GFLabel"])])
        for label, amount in rows:
            data.append([Paragraph(_escape(label), styles["GFValue"]), Paragraph(_escape(amount), styles["GFValue"]), Paragraph("—", styles["GFLabel"])])
        t = Table(data, colWidths=[110 * mm, 45 * mm, 25 * mm])
        t.setStyle(
            TableStyle(
                [
                    ("SPAN", (0, 0), (-1, 0)),
                    ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#eff6ff")),
                    ("TEXTCOLOR", (0, 1), (-1, 1), muted),
                    ("LINEABOVE", (0, 2), (-1, 2), 0.6, line),
                    ("GRID", (0, 1), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
                    ("BOX", (0, 1), (-1, -1), 0.6, colors.HexColor("#e2e8f0")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )
        return t

    story.append(section_table(title="EARNINGS", rows=[("Gross Earnings", gross)]))
    story.append(Spacer(1, 10))
    story.append(section_table(title="DEDUCTIONS", rows=[("Total Deductions", ded)]))
    story.append(Spacer(1, 10))
    story.append(section_table(title="REIMBURSEMENTS", rows=[("Total Reimbursements", _money(item.currency, 0))]))
    story.append(Spacer(1, 10))

    net_row = Table(
        [[Paragraph("NET PAY (Gross Earnings − Total Deductions + Reimbursements)", styles["GFLabel"]), Paragraph(_escape(net), styles["GFValueBold"]) ]],
        colWidths=[140 * mm, 40 * mm],
    )
    net_row.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
                ("BOX", (0, 0), (-1, -1), 0.8, line),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(net_row)

    story.append(Spacer(1, 12))
    footer_text = f"Generated {generated_label} · {brand_website} · This is a system generated payslip"
    story.append(Paragraph(_escape(footer_text), ParagraphStyle(name="GFFooter", parent=styles["GFSub"], fontSize=8, textColor=muted, alignment=1)))

    def _on_page(canvas, doc):  # noqa: ANN001
        _draw_pdf_logo_watermark(canvas=canvas, doc=doc, logo_path=logo_path)

    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    data = buf.getvalue()
    buf.close()

    filename = f"payslip_{period}_{payslip_id}.pdf"
    disposition = "attachment" if int(download or 0) == 1 else "inline"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )
