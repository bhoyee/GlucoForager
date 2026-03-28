from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
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


@router.get("/staff/month")
def staff_month_report(
    year: int,
    month: int,
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

    staff_users = db.query(StaffUser).order_by(StaffUser.email.asc()).all()
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

        items.append(
            {
                "staff_user_id": staff.id,
                "email": staff.email,
                "timezone": staff.timezone,
                "is_active": bool(staff.is_active),
                "days_clocked_in": days_clocked_in,
                "days_complete": days_complete,
                "missing_clock_out": missing_clock_out,
                "on_time_in": on_time_in,
                "on_time_out": on_time_out,
                "late_or_early": late_or_early,
                "work_logs_count": int(work_logs_count),
            }
        )

    return {"month": f"{year}-{str(month).zfill(2)}", "items": items}

