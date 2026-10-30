"""Business accounts for UK self-assessment: income records, receipts, and tax-year totals.

The UK tax year runs 6 April to 5 April. Expenses live in staff_expenses (admin_expenses.py);
this module adds the income side, receipt/statement uploads, and the tax-year summary + CSV.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.business_income import BusinessIncome
from ...models.staff_expense import StaffExpense
from ...models.staff_user import StaffUser
from ...services.drive_storage_service import delete_drive_object, load_drive_bytes, store_drive_upload
from ...services.exchange_rate_service import ExchangeRateError, convert_to_gbp
from .admin_expenses import ALLOWED_CURRENCIES, CATEGORY_LABELS, _expense_gbp_amount


router = APIRouter(prefix="/admin/accounts", tags=["admin-accounts"])

TRADING_ALLOWANCE_GBP = Decimal("1000")
DOCUMENT_MAX_BYTES = 5 * 1024 * 1024
DOCUMENT_FOLDER = "accounts"

INCOME_SOURCES = {
    "app_store": "App Store (Apple)",
    "google_play": "Google Play",
    "stripe": "Stripe / web",
    "other": "Other",
}


class IncomePayload(BaseModel):
    income_date: date
    amount: float = Field(..., gt=0, le=1_000_000)
    currency: str = Field("GBP", max_length=8)
    source: str = Field("other", max_length=32)
    note: str | None = Field(None, max_length=240)


def tax_year_bounds(start_year: int) -> tuple[date, date]:
    """6 April start_year (inclusive) to 6 April start_year + 1 (exclusive)."""
    return date(int(start_year), 4, 6), date(int(start_year) + 1, 4, 6)


def current_tax_year_start(today: date | None = None) -> int:
    today = today or date.today()
    return today.year if today >= date(today.year, 4, 6) else today.year - 1


def _tax_year_label(start_year: int) -> str:
    return f"{int(start_year)}/{str(int(start_year) + 1)[-2:]}"


def _income_gbp_amount(row: BusinessIncome) -> Decimal | None:
    if row.amount_gbp is not None:
        return Decimal(str(row.amount_gbp))
    if str(row.currency or "").upper() == "GBP":
        return Decimal(str(row.amount))
    return None


def _income_to_dict(row: BusinessIncome) -> dict:
    return {
        "id": row.id,
        "income_date": row.income_date.isoformat(),
        "source": row.source,
        "source_label": INCOME_SOURCES.get(row.source, row.source),
        "amount": float(row.amount),
        "currency": row.currency,
        "amount_gbp": float(row.amount_gbp) if row.amount_gbp is not None else None,
        "exchange_rate_to_gbp": float(row.exchange_rate_to_gbp) if row.exchange_rate_to_gbp is not None else None,
        "note": row.note,
        "has_document": bool(row.document_filename),
        "document_name": row.document_original_name,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _income_values(payload: IncomePayload):
    currency = (payload.currency or "GBP").strip().upper()[:8] or "GBP"
    source = (payload.source or "other").strip().lower()[:32] or "other"
    if currency not in ALLOWED_CURRENCIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported currency")
    if source not in INCOME_SOURCES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported income source")
    try:
        conversion = convert_to_gbp(Decimal(str(payload.amount)), currency)
    except ExchangeRateError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not convert {currency} to GBP right now. Please try again.",
        ) from exc
    return currency, source, conversion


def _apply_income(row: BusinessIncome, payload: IncomePayload) -> None:
    currency, source, conversion = _income_values(payload)
    row.income_date = payload.income_date
    row.amount = payload.amount
    row.currency = currency
    row.source = source
    row.amount_gbp = conversion.amount_gbp
    row.exchange_rate_to_gbp = conversion.rate_to_gbp
    row.exchange_rate_source = conversion.source
    row.converted_at = conversion.converted_at
    row.note = payload.note.strip()[:240] if payload.note else None


def _get_income_or_404(db: Session, income_id: int) -> BusinessIncome:
    row = db.query(BusinessIncome).filter(BusinessIncome.id == int(income_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def _get_expense_or_404(db: Session, expense_id: int) -> StaffExpense:
    row = db.query(StaffExpense).filter(StaffExpense.id == int(expense_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


# --- Income ------------------------------------------------------------------


@router.get("/income")
def list_income(
    tax_year: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.read")),  # noqa: ARG001
):
    start_year = int(tax_year) if tax_year else current_tax_year_start()
    start, end = tax_year_bounds(start_year)
    rows = (
        db.query(BusinessIncome)
        .filter(BusinessIncome.income_date >= start, BusinessIncome.income_date < end)
        .order_by(BusinessIncome.income_date.desc(), BusinessIncome.id.desc())
        .all()
    )
    return {"tax_year": start_year, "items": [_income_to_dict(r) for r in rows]}


@router.post("/income")
def create_income(
    payload: IncomePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.write")),
):
    row = BusinessIncome(created_by_staff_user_id=current_staff.id, created_at=datetime.utcnow())
    _apply_income(row, payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "item": _income_to_dict(row)}


@router.put("/income/{income_id}")
def update_income(
    income_id: int,
    payload: IncomePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.write")),  # noqa: ARG001
):
    row = _get_income_or_404(db, income_id)
    _apply_income(row, payload)
    db.commit()
    return {"ok": True, "item": _income_to_dict(row)}


@router.delete("/income/{income_id}")
def delete_income(
    income_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.write")),  # noqa: ARG001
):
    row = _get_income_or_404(db, income_id)
    _delete_stored(row, "document")
    db.delete(row)
    db.commit()
    return {"ok": True}


# --- Receipts and statements -------------------------------------------------


def _store_document(row, prefix: str, file: UploadFile, staff_id: int) -> None:
    try:
        stored = store_drive_upload(staff_user_id=staff_id, file=file, folder=DOCUMENT_FOLDER, max_bytes=DOCUMENT_MAX_BYTES)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    _delete_stored(row, prefix)
    setattr(row, f"{prefix}_storage_backend", stored.storage_backend)
    setattr(row, f"{prefix}_remote_dir", stored.remote_dir)
    setattr(row, f"{prefix}_filename", stored.filename)
    setattr(row, f"{prefix}_original_name", (file.filename or "")[:200] or None)
    setattr(row, f"{prefix}_content_type", file.content_type or None)


def _delete_stored(row, prefix: str) -> None:
    filename = getattr(row, f"{prefix}_filename")
    if not filename:
        return
    try:
        delete_drive_object(
            storage_backend=getattr(row, f"{prefix}_storage_backend"),
            remote_dir=getattr(row, f"{prefix}_remote_dir"),
            filename=filename,
        )
    except Exception:
        pass  # a missing remote file should not block replacing or deleting the record
    for name in ("storage_backend", "remote_dir", "filename", "original_name", "content_type"):
        setattr(row, f"{prefix}_{name}", None)


def _download_stored(row, prefix: str) -> Response:
    filename = getattr(row, f"{prefix}_filename")
    if not filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No file attached")
    try:
        data = load_drive_bytes(
            storage_backend=getattr(row, f"{prefix}_storage_backend"),
            remote_dir=getattr(row, f"{prefix}_remote_dir"),
            filename=filename,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not load the file") from exc
    name = (getattr(row, f"{prefix}_original_name") or filename).replace('"', "")
    return Response(
        content=data,
        media_type=getattr(row, f"{prefix}_content_type") or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{name}"'},
    )


@router.post("/expenses/{expense_id}/receipt")
def upload_expense_receipt(
    expense_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.write")),
):
    row = _get_expense_or_404(db, expense_id)
    _store_document(row, "receipt", file, int(current_staff.id))
    db.commit()
    return {"ok": True}


@router.get("/expenses/{expense_id}/receipt")
def download_expense_receipt(
    expense_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.read")),  # noqa: ARG001
):
    return _download_stored(_get_expense_or_404(db, expense_id), "receipt")


@router.delete("/expenses/{expense_id}/receipt")
def delete_expense_receipt(
    expense_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.write")),  # noqa: ARG001
):
    row = _get_expense_or_404(db, expense_id)
    _delete_stored(row, "receipt")
    db.commit()
    return {"ok": True}


@router.post("/income/{income_id}/document")
def upload_income_document(
    income_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.write")),
):
    row = _get_income_or_404(db, income_id)
    _store_document(row, "document", file, int(current_staff.id))
    db.commit()
    return {"ok": True, "item": _income_to_dict(row)}


@router.get("/income/{income_id}/document")
def download_income_document(
    income_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.read")),  # noqa: ARG001
):
    return _download_stored(_get_income_or_404(db, income_id), "document")


@router.delete("/income/{income_id}/document")
def delete_income_document(
    income_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.write")),  # noqa: ARG001
):
    row = _get_income_or_404(db, income_id)
    _delete_stored(row, "document")
    db.commit()
    return {"ok": True}


# --- Tax-year summary --------------------------------------------------------


def _tax_year_rows(db: Session, start_year: int):
    start, end = tax_year_bounds(start_year)
    income = (
        db.query(BusinessIncome)
        .filter(BusinessIncome.income_date >= start, BusinessIncome.income_date < end)
        .order_by(BusinessIncome.income_date.asc(), BusinessIncome.id.asc())
        .all()
    )
    expenses = (
        db.query(StaffExpense)
        .filter(StaffExpense.expense_date >= start, StaffExpense.expense_date < end)
        .order_by(StaffExpense.expense_date.asc(), StaffExpense.id.asc())
        .all()
    )
    return income, expenses


def build_tax_year_summary(db: Session, start_year: int) -> dict:
    income, expenses = _tax_year_rows(db, start_year)
    start, end = tax_year_bounds(start_year)

    by_source: dict[str, Decimal] = {}
    for row in income:
        value = _income_gbp_amount(row)
        if value is not None:
            by_source[row.source] = by_source.get(row.source, Decimal("0")) + value
    by_category: dict[str, Decimal] = {}
    for row in expenses:
        value = _expense_gbp_amount(row)
        if value is not None:
            category = str(row.category or "general")
            by_category[category] = by_category.get(category, Decimal("0")) + value

    income_total = sum(by_source.values(), Decimal("0"))
    expense_total = sum(by_category.values(), Decimal("0"))

    # Trading allowance: gross income up to £1,000 needs no report. Above it, deduct either actual
    # expenses or the £1,000 allowance, whichever is bigger.
    if income_total <= TRADING_ALLOWANCE_GBP:
        allowance_status = "under"
        deduction_method = "none_needed"
        taxable_profit = Decimal("0")
    else:
        allowance_status = "over"
        use_allowance = TRADING_ALLOWANCE_GBP > expense_total
        deduction_method = "trading_allowance" if use_allowance else "actual_expenses"
        taxable_profit = max(Decimal("0"), income_total - max(TRADING_ALLOWANCE_GBP, expense_total))

    return {
        "tax_year": int(start_year),
        "label": _tax_year_label(start_year),
        "start": start.isoformat(),
        "end": date(end.year, 4, 5).isoformat(),
        "is_current": int(start_year) == current_tax_year_start(),
        "income_total_gbp": float(income_total),
        "income_by_source": [
            {"source": k, "label": INCOME_SOURCES.get(k, k), "amount_gbp": float(v)}
            for k, v in sorted(by_source.items(), key=lambda kv: kv[1], reverse=True)
        ],
        "expense_total_gbp": float(expense_total),
        "expense_by_category": [
            {"category": k, "label": CATEGORY_LABELS.get(k, k), "amount_gbp": float(v)}
            for k, v in sorted(by_category.items(), key=lambda kv: kv[1], reverse=True)
        ],
        "profit_gbp": float(income_total - expense_total),
        "trading_allowance_gbp": float(TRADING_ALLOWANCE_GBP),
        "allowance_status": allowance_status,
        "allowance_used_pct": float(min(Decimal("100"), income_total / TRADING_ALLOWANCE_GBP * 100)),
        "deduction_method": deduction_method,
        "taxable_profit_gbp": float(taxable_profit),
        "counts": {
            "income": len(income),
            "expenses": len(expenses),
            "expenses_missing_receipt": sum(1 for r in expenses if not r.receipt_filename),
            "income_missing_document": sum(1 for r in income if not r.document_filename),
            "unconverted": sum(1 for r in expenses if _expense_gbp_amount(r) is None)
            + sum(1 for r in income if _income_gbp_amount(r) is None),
        },
        "deadlines": {
            "register_by": date(int(start_year) + 1, 10, 5).isoformat(),
            "file_and_pay_by": date(int(start_year) + 2, 1, 31).isoformat(),
        },
    }


@router.get("/tax-year")
def tax_year_summary(
    start_year: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.read")),  # noqa: ARG001
):
    return build_tax_year_summary(db, int(start_year) if start_year else current_tax_year_start())


@router.get("/tax-year.csv")
def tax_year_csv(
    start_year: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.read")),  # noqa: ARG001
):
    income, expenses = _tax_year_rows(db, int(start_year))
    summary = build_tax_year_summary(db, int(start_year))

    def money(value) -> str:
        return "" if value is None else f"{Decimal(str(value)):.2f}"

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Type", "Date", "Source / category", "Description", "Amount", "Currency", "Amount GBP", "Rate to GBP", "Receipt / statement"])
    for row in income:
        writer.writerow([
            "Income", row.income_date.isoformat(), INCOME_SOURCES.get(row.source, row.source), row.note or "",
            money(row.amount), row.currency, money(_income_gbp_amount(row)), row.exchange_rate_to_gbp or "",
            "Yes" if row.document_filename else "No",
        ])
    for row in expenses:
        writer.writerow([
            "Expense", row.expense_date.isoformat(), CATEGORY_LABELS.get(row.category, row.category), row.note or "",
            money(row.amount), row.currency, money(_expense_gbp_amount(row)), row.exchange_rate_to_gbp or "",
            "Yes" if row.receipt_filename else "No",
        ])
    writer.writerow([])
    writer.writerow(["Tax year", summary["label"], f"{summary['start']} to {summary['end']}"])
    writer.writerow(["Total income (GBP)", money(summary["income_total_gbp"])])
    writer.writerow(["Total allowable expenses (GBP)", money(summary["expense_total_gbp"])])
    writer.writerow(["Profit (GBP)", money(summary["profit_gbp"])])

    filename = f"accounts_{summary['label'].replace('/', '-')}.csv"
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
