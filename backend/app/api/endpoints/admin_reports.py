from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_time_entry import StaffTimeEntry
from ...models.staff_user import StaffUser
from ...models.staff_work_log import StaffWorkLog


router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])


def _safe_tz(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except Exception:
        return ZoneInfo("UTC")


def _within_window(local_dt: datetime, *, target_hour: int, target_minute: int, minutes_before: int, minutes_after: int) -> bool:
    target = local_dt.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
    delta_minutes = (local_dt - target).total_seconds() / 60.0
    return (-minutes_before) <= delta_minutes <= minutes_after


def _iter_dates(start: date, end: date) -> list[date]:
    out: list[date] = []
    cur = start
    while cur < end:
        out.append(cur)
        cur = cur + timedelta(days=1)
    return out


def _summarize_attendance(entries: list[StaffTimeEntry], tz: ZoneInfo) -> dict:
    days_clocked_in = 0
    days_complete = 0
    missing_clock_out = 0
    on_time_in = 0
    on_time_out = 0
    late_or_early = 0

    for e in entries:
        if e.clock_in_at:
            days_clocked_in += 1
            local_in = e.clock_in_at.replace(tzinfo=timezone.utc).astimezone(tz)
            ok_in = _within_window(local_in, target_hour=9, target_minute=0, minutes_before=30, minutes_after=30)
            if ok_in:
                on_time_in += 1
            else:
                late_or_early += 1
        if e.clock_in_at and e.clock_out_at:
            days_complete += 1
            local_out = e.clock_out_at.replace(tzinfo=timezone.utc).astimezone(tz)
            ok_out = _within_window(local_out, target_hour=17, target_minute=0, minutes_before=30, minutes_after=30)
            if ok_out:
                on_time_out += 1
            else:
                late_or_early += 1
        if e.clock_in_at and not e.clock_out_at:
            missing_clock_out += 1

    return {
        "days_clocked_in": days_clocked_in,
        "days_complete": days_complete,
        "missing_clock_out": missing_clock_out,
        "on_time_in": on_time_in,
        "on_time_out": on_time_out,
        "late_or_early": late_or_early,
    }


@router.get("/staff/month")
def staff_month_report(
    year: int,
    month: int,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("reports.read")),  # noqa: ARG001
):
    if month < 1 or month > 12:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid month")

    start = date(int(year), int(month), 1)
    if month == 12:
        end = date(int(year) + 1, 1, 1)
    else:
        end = date(int(year), int(month) + 1, 1)

    staff_q = db.query(StaffUser)
    if not include_deleted:
        staff_q = staff_q.filter(StaffUser.deleted_at.is_(None))
    staff_users = staff_q.order_by(StaffUser.email.asc()).all()

    items: list[dict] = []
    for staff in staff_users:
        tz = _safe_tz(staff.timezone or "UTC")
        entries = (
            db.query(StaffTimeEntry)
            .filter(
                StaffTimeEntry.staff_user_id == staff.id,
                StaffTimeEntry.work_date >= start,
                StaffTimeEntry.work_date < end,
            )
            .order_by(StaffTimeEntry.work_date.asc())
            .all()
        )
        work_logs_count = (
            db.query(StaffWorkLog)
            .filter(
                StaffWorkLog.staff_user_id == staff.id,
                StaffWorkLog.work_date >= start,
                StaffWorkLog.work_date < end,
            )
            .count()
        )
        items.append(
            {
                "staff_user_id": staff.id,
                "email": staff.email,
                "timezone": staff.timezone,
                "is_active": bool(staff.is_active),
                "deleted_at": staff.deleted_at.isoformat() if getattr(staff, "deleted_at", None) else None,
                **_summarize_attendance(entries, tz),
                "work_logs_count": int(work_logs_count),
            }
        )

    return {"month": f"{year}-{str(month).zfill(2)}", "items": items}


@router.get("/staff/month.csv")
def staff_month_report_csv(
    year: int,
    month: int,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("reports.read")),  # noqa: ARG001
):
    data = staff_month_report(year=year, month=month, include_deleted=include_deleted, db=db, current_staff=current_staff)
    items = data.get("items") if isinstance(data, dict) else None
    items = items if isinstance(items, list) else []

    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=[
            "month",
            "staff_user_id",
            "email",
            "timezone",
            "is_active",
            "deleted_at",
            "days_clocked_in",
            "days_complete",
            "missing_clock_out",
            "on_time_in",
            "on_time_out",
            "late_or_early",
            "work_logs_count",
        ],
    )
    writer.writeheader()
    for row in items:
        if not isinstance(row, dict):
            continue
        out = {"month": data.get("month")}
        for k in writer.fieldnames:
            if k == "month":
                continue
            out[k] = row.get(k)
        writer.writerow(out)

    filename = f"staff_report_{data.get('month', 'month')}.csv"
    return PlainTextResponse(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/staff/{staff_user_id}/month")
def staff_month_detail(
    staff_user_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("reports.read")),  # noqa: ARG001
):
    if month < 1 or month > 12:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid month")

    staff = db.query(StaffUser).filter(StaffUser.id == int(staff_user_id)).first()
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")

    start = date(int(year), int(month), 1)
    if month == 12:
        end = date(int(year) + 1, 1, 1)
    else:
        end = date(int(year), int(month) + 1, 1)

    entries = (
        db.query(StaffTimeEntry)
        .filter(
            StaffTimeEntry.staff_user_id == staff.id,
            StaffTimeEntry.work_date >= start,
            StaffTimeEntry.work_date < end,
        )
        .order_by(StaffTimeEntry.work_date.asc())
        .all()
    )
    entry_by_date: dict[str, StaffTimeEntry] = {}
    for e in entries:
        key = e.work_date.isoformat()
        if key not in entry_by_date:
            entry_by_date[key] = e

    work_logs_rows = (
        db.query(StaffWorkLog.work_date)
        .filter(
            StaffWorkLog.staff_user_id == staff.id,
            StaffWorkLog.work_date >= start,
            StaffWorkLog.work_date < end,
        )
        .all()
    )
    work_logs_count_by_date: dict[str, int] = {}
    for (d,) in work_logs_rows:
        key = d.isoformat()
        work_logs_count_by_date[key] = int(work_logs_count_by_date.get(key, 0)) + 1

    tz = _safe_tz(staff.timezone or "UTC")
    attendance = _summarize_attendance(entries, tz)

    days: list[dict] = []
    for d in _iter_dates(start, end):
        key = d.isoformat()
        e = entry_by_date.get(key)
        days.append(
            {
                "work_date": key,
                "clock_in_at": e.clock_in_at.isoformat() if (e and e.clock_in_at) else None,
                "clock_out_at": e.clock_out_at.isoformat() if (e and e.clock_out_at) else None,
                "missing_clock_out": bool(e and e.clock_in_at and not e.clock_out_at),
                "work_logs_count": int(work_logs_count_by_date.get(key, 0)),
                "edited_at": e.edited_at.isoformat() if (e and e.edited_at) else None,
                "edit_reason": e.edit_reason if e else None,
                "approved_at": e.approved_at.isoformat() if (e and getattr(e, "approved_at", None)) else None,
                "approval_reason": getattr(e, "approval_reason", None) if e else None,
            }
        )

    return {
        "staff_user_id": staff.id,
        "email": staff.email,
        "timezone": staff.timezone,
        "month": f"{year}-{str(month).zfill(2)}",
        "summary": {**attendance, "work_logs_count": sum(work_logs_count_by_date.values())},
        "days": days,
    }


@router.get("/staff/{staff_user_id}/week")
def staff_week_detail(
    staff_user_id: int,
    start: str,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("reports.read")),  # noqa: ARG001
):
    try:
        start_date = date.fromisoformat(str(start))
    except Exception:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid start date")
    end_date = start_date + timedelta(days=7)

    staff = db.query(StaffUser).filter(StaffUser.id == int(staff_user_id)).first()
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")

    entries = (
        db.query(StaffTimeEntry)
        .filter(
            StaffTimeEntry.staff_user_id == staff.id,
            StaffTimeEntry.work_date >= start_date,
            StaffTimeEntry.work_date < end_date,
        )
        .order_by(StaffTimeEntry.work_date.asc())
        .all()
    )
    entry_by_date: dict[str, StaffTimeEntry] = {}
    for e in entries:
        key = e.work_date.isoformat()
        if key not in entry_by_date:
            entry_by_date[key] = e

    work_logs_rows = (
        db.query(StaffWorkLog.work_date)
        .filter(
            StaffWorkLog.staff_user_id == staff.id,
            StaffWorkLog.work_date >= start_date,
            StaffWorkLog.work_date < end_date,
        )
        .all()
    )
    work_logs_count_by_date: dict[str, int] = {}
    for (d,) in work_logs_rows:
        key = d.isoformat()
        work_logs_count_by_date[key] = int(work_logs_count_by_date.get(key, 0)) + 1

    tz = _safe_tz(staff.timezone or "UTC")
    attendance = _summarize_attendance(entries, tz)

    days: list[dict] = []
    for d in _iter_dates(start_date, end_date):
        key = d.isoformat()
        e = entry_by_date.get(key)
        days.append(
            {
                "work_date": key,
                "clock_in_at": e.clock_in_at.isoformat() if (e and e.clock_in_at) else None,
                "clock_out_at": e.clock_out_at.isoformat() if (e and e.clock_out_at) else None,
                "missing_clock_out": bool(e and e.clock_in_at and not e.clock_out_at),
                "work_logs_count": int(work_logs_count_by_date.get(key, 0)),
                "edited_at": e.edited_at.isoformat() if (e and e.edited_at) else None,
                "edit_reason": e.edit_reason if e else None,
                "approved_at": e.approved_at.isoformat() if (e and getattr(e, "approved_at", None)) else None,
                "approval_reason": getattr(e, "approval_reason", None) if e else None,
            }
        )

    return {
        "staff_user_id": staff.id,
        "email": staff.email,
        "timezone": staff.timezone,
        "week_start": start_date.isoformat(),
        "week_end": (end_date - timedelta(days=1)).isoformat(),
        "summary": {**attendance, "work_logs_count": sum(work_logs_count_by_date.values())},
        "days": days,
    }

