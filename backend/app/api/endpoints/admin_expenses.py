from __future__ import annotations

import io
from calendar import month_name
from datetime import date, datetime
from decimal import Decimal
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_expense import StaffExpense
from ...models.staff_user import StaffUser
from ...services.exchange_rate_service import ExchangeRateError, convert_to_gbp


router = APIRouter(prefix="/admin/expenses", tags=["admin-expenses"])

ALLOWED_CURRENCIES = {"USD", "GBP", "NGN"}
ALLOWED_CATEGORIES = {
    "general",
    "salary",
    "software",
    "hosting",
    "ai_services",
    "marketing",
    "office",
    "travel",
    "meals",
    "equipment",
    "contractors",
    "taxes",
    "subscriptions",
    "refunds",
    "domain",
    "app_store",
    "other",
}
CATEGORY_LABELS = {
    "general": "General",
    "salary": "Salary",
    "software": "Software",
    "hosting": "Hosting & infrastructure",
    "ai_services": "AI services",
    "marketing": "Marketing",
    "office": "Office",
    "travel": "Travel",
    "meals": "Meals",
    "equipment": "Equipment",
    "contractors": "Contractors",
    "taxes": "Taxes",
    "subscriptions": "Subscriptions",
    "refunds": "Refunds",
    "domain": "Domain",
    "app_store": "App Store",
    "other": "Other",
}


class ExpenseCreatePayload(BaseModel):
    expense_date: date
    amount: float = Field(..., gt=0, le=1_000_000)
    currency: str = Field("GBP", max_length=8)
    category: str = Field("general", max_length=64)
    note: str | None = Field(None, max_length=240)


class ExpenseUpdatePayload(BaseModel):
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
    current_staff: StaffUser = Depends(require_staff_permission("expenses.read")),  # noqa: ARG001
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
                "amount_gbp": float(r.amount_gbp) if r.amount_gbp is not None else None,
                "exchange_rate_to_gbp": float(r.exchange_rate_to_gbp) if r.exchange_rate_to_gbp is not None else None,
                "exchange_rate_source": r.exchange_rate_source,
                "converted_at": r.converted_at.isoformat() if r.converted_at else None,
                "category": r.category,
                "note": r.note,
                "created_by_staff_user_id": r.created_by_staff_user_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.get("/summary")
def expenses_summary(
    year: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.read")),  # noqa: ARG001
):
    start = date(int(year), 1, 1)
    end = date(int(year) + 1, 1, 1)
    rows = _expense_rows(db, start, end)

    by_month = {i: Decimal("0") for i in range(1, 13)}
    by_category: dict[str, Decimal] = {}
    for row in rows:
        gbp_value = _expense_gbp_amount(row)
        if gbp_value is None:
            continue
        by_month[int(row.expense_date.month)] += gbp_value
        category = str(row.category or "general")
        by_category[category] = by_category.get(category, Decimal("0")) + gbp_value

    return {
        "year": int(year),
        "month_totals": [
            {
                "month": month,
                "label": month_name[month],
                "amount_gbp": float(total),
            }
            for month, total in by_month.items()
        ],
        "category_totals": [
            {
                "category": category,
                "label": CATEGORY_LABELS.get(category, category),
                "amount_gbp": float(total),
            }
            for category, total in sorted(by_category.items(), key=lambda item: item[1], reverse=True)
        ],
        "total_gbp": float(sum(by_month.values(), Decimal("0"))),
    }


@router.post("")
def create_expense(
    payload: ExpenseCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.write")),
):
    currency, category, conversion = _expense_payload_values(payload)

    row = StaffExpense(
        created_by_staff_user_id=current_staff.id,
        expense_date=payload.expense_date,
        amount=payload.amount,
        currency=currency,
        amount_gbp=conversion.amount_gbp,
        exchange_rate_to_gbp=conversion.rate_to_gbp,
        exchange_rate_source=conversion.source,
        converted_at=conversion.converted_at,
        category=category,
        note=(payload.note.strip()[:240] if payload.note else None),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id}


@router.put("/{expense_id}")
def update_expense(
    expense_id: int,
    payload: ExpenseUpdatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.write")),
):
    row = db.query(StaffExpense).filter(StaffExpense.id == int(expense_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if int(row.created_by_staff_user_id) != int(current_staff.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    currency, category, conversion = _expense_payload_values(payload)
    row.expense_date = payload.expense_date
    row.amount = payload.amount
    row.currency = currency
    row.amount_gbp = conversion.amount_gbp
    row.exchange_rate_to_gbp = conversion.rate_to_gbp
    row.exchange_rate_source = conversion.source
    row.converted_at = conversion.converted_at
    row.category = category
    row.note = payload.note.strip()[:240] if payload.note else None
    db.commit()
    return {"ok": True, "id": row.id}


@router.get("/export.pdf")
def export_month_expenses_pdf(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.read")),  # noqa: ARG001
):
    if month < 1 or month > 12:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid month")
    start, end = _month_range(year, month)
    rows = _expense_rows(db, start, end)
    month_label = f"{month_name[int(month)]} {int(year)}"
    pdf = _expenses_pdf(
        rows,
        title="GlucoForager Expenses Report",
        period_label=month_label,
        scope_label="Monthly expenses",
    )
    filename = f"expenses_{year}-{month:02d}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export-year.pdf")
def export_year_expenses_pdf(
    year: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.read")),  # noqa: ARG001
):
    start = date(int(year), 1, 1)
    end = date(int(year) + 1, 1, 1)
    rows = _expense_rows(db, start, end)
    pdf = _expenses_pdf(
        rows,
        title="GlucoForager Annual Expenses Report",
        period_label=str(int(year)),
        scope_label="Annual expenses grouped by month",
    )
    filename = f"expenses_{year}_by_month.pdf"
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{expense_id}")
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("expenses.write")),
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


def _month_range(year: int, month: int) -> tuple[date, date]:
    start = date(int(year), int(month), 1)
    if int(month) == 12:
        return start, date(int(year) + 1, 1, 1)
    return start, date(int(year), int(month) + 1, 1)


def _expense_rows(db: Session, start: date, end: date) -> list[StaffExpense]:
    return (
        db.query(StaffExpense)
        .filter(StaffExpense.expense_date >= start, StaffExpense.expense_date < end)
        .order_by(StaffExpense.expense_date.asc(), StaffExpense.id.asc())
        .all()
    )


def _expense_payload_values(payload: ExpenseCreatePayload | ExpenseUpdatePayload):
    currency = (payload.currency or "GBP").strip().upper()[:8] or "GBP"
    category = (payload.category or "general").strip().lower()[:64] or "general"
    if currency not in ALLOWED_CURRENCIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported expense currency")
    if category not in ALLOWED_CATEGORIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported expense category")

    try:
        conversion = convert_to_gbp(Decimal(str(payload.amount)), currency)
    except ExchangeRateError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not convert {currency} to GBP right now. Please try again.",
        ) from exc
    return currency, category, conversion


def _expenses_pdf(rows: list[StaffExpense], *, title: str, period_label: str, scope_label: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=title,
        author="GlucoForager",
    )
    styles = getSampleStyleSheet()
    ink = colors.HexColor("#0f172a")
    muted = colors.HexColor("#475569")
    green = colors.HexColor("#0f6e56")
    mint = colors.HexColor("#e1f5ee")
    amber = colors.HexColor("#faeeda")
    line = colors.HexColor("#d8e6df")

    styles.add(ParagraphStyle(name="GFTitle", parent=styles["Title"], fontSize=18, leading=22, textColor=ink, spaceAfter=6))
    styles.add(ParagraphStyle(name="GFSub", parent=styles["Normal"], fontSize=9, leading=12, textColor=muted))
    styles.add(ParagraphStyle(name="GFHeader", parent=styles["Normal"], fontSize=8, leading=10, textColor=colors.white, fontName="Helvetica-Bold"))
    styles.add(ParagraphStyle(name="GFCell", parent=styles["Normal"], fontSize=8, leading=10, textColor=ink))
    styles.add(ParagraphStyle(name="GFCellBold", parent=styles["GFCell"], fontName="Helvetica-Bold"))
    styles.add(ParagraphStyle(name="GFFooter", parent=styles["GFSub"], alignment=1, fontSize=7))

    generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    story = [
        Paragraph(_escape(title), styles["GFTitle"]),
        Paragraph("Prepared for finance and tax record keeping.", styles["GFSub"]),
        Spacer(1, 8),
    ]

    detail_table = Table(
        [
            [Paragraph("Report details", styles["GFCellBold"]), ""],
            [Paragraph("Period", styles["GFCellBold"]), Paragraph(_escape(period_label), styles["GFCell"])],
            [Paragraph("Scope", styles["GFCellBold"]), Paragraph(_escape(scope_label), styles["GFCell"])],
            [Paragraph("Generated", styles["GFCellBold"]), Paragraph(_escape(generated_at), styles["GFCell"])],
        ],
        colWidths=[38 * mm, 132 * mm],
    )
    detail_table.setStyle(
        TableStyle(
            [
                ("SPAN", (0, 0), (-1, 0)),
                ("BACKGROUND", (0, 0), (-1, 0), mint),
                ("TEXTCOLOR", (0, 0), (-1, 0), green),
                ("BOX", (0, 0), (-1, -1), 0.5, line),
                ("GRID", (0, 1), (-1, -1), 0.25, line),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.extend([detail_table, Spacer(1, 12)])

    table_rows = [[
        Paragraph("Month", styles["GFHeader"]),
        Paragraph("Amount", styles["GFHeader"]),
        Paragraph("Category", styles["GFHeader"]),
        Paragraph("Note", styles["GFHeader"]),
    ]]
    highlight_rows: list[int] = []
    current_month: str | None = None
    current_month_total = Decimal("0")
    year_total = Decimal("0")

    def append_total(label: str, total: Decimal, total_label: str) -> None:
        table_rows.append(
            [
                Paragraph(_escape(label), styles["GFCellBold"]),
                Paragraph(_escape(_gbp(total)), styles["GFCellBold"]),
                Paragraph(_escape(total_label), styles["GFCellBold"]),
                Paragraph("", styles["GFCell"]),
            ]
        )
        highlight_rows.append(len(table_rows) - 1)

    for row in rows:
        month_label = f"{month_name[int(row.expense_date.month)]} {int(row.expense_date.year)}"
        if current_month and month_label != current_month:
            append_total(current_month, current_month_total, "Monthly total")
            current_month_total = Decimal("0")
        current_month = month_label

        gbp_value = _expense_gbp_amount(row)
        if gbp_value is not None:
            current_month_total += gbp_value
            year_total += gbp_value

        table_rows.append(
            [
                Paragraph(_escape(month_label), styles["GFCell"]),
                Paragraph(_escape(_gbp(gbp_value)) if gbp_value is not None else "Not converted", styles["GFCell"]),
                Paragraph(_escape(CATEGORY_LABELS.get(str(row.category or ""), str(row.category or "General"))), styles["GFCell"]),
                Paragraph(_escape(row.note or ""), styles["GFCell"]),
            ]
        )

    if current_month:
        append_total(current_month, current_month_total, "Monthly total")
    if rows:
        append_total("All months", year_total, "Yearly total")
    else:
        table_rows.append([Paragraph("No expenses found for this period.", styles["GFCell"]), "", "", ""])

    table = Table(table_rows, colWidths=[36 * mm, 30 * mm, 42 * mm, 62 * mm], repeatRows=1)
    table_style = [
        ("BACKGROUND", (0, 0), (-1, 0), green),
        ("GRID", (0, 0), (-1, -1), 0.25, line),
        ("BOX", (0, 0), (-1, -1), 0.6, line),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for row_index in highlight_rows:
        table_style.extend(
            [
                ("BACKGROUND", (0, row_index), (-1, row_index), amber),
                ("TEXTCOLOR", (0, row_index), (-1, row_index), ink),
                ("LINEABOVE", (0, row_index), (-1, row_index), 0.8, colors.HexColor("#ba7517")),
            ]
        )
    table.setStyle(TableStyle(table_style))
    story.append(table)
    story.extend(
        [
            Spacer(1, 10),
            Paragraph(
                "This report is generated from the GlucoForager admin expense records. Keep supporting invoices and receipts with your accounting records.",
                styles["GFFooter"],
            ),
        ]
    )
    doc.build(story)
    return buf.getvalue()


def _expense_gbp_amount(row: StaffExpense) -> Decimal | None:
    if row.amount_gbp is not None:
        return Decimal(str(row.amount_gbp))
    if str(row.currency or "").upper() == "GBP":
        return Decimal(str(row.amount))
    return None


def _format_decimal(value, *, places: int = 2) -> str:
    if value is None:
        return ""
    return f"{Decimal(str(value)):.{places}f}"


def _gbp(value) -> str:
    if value is None:
        return ""
    return f"\u00a3{_format_decimal(value)}"


def _escape(value: str) -> str:
    return escape(str(value or ""))
