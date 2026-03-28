from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.staff_time_entry import StaffTimeEntry
from ...models.staff_user import StaffUser


router = APIRouter(prefix="/admin/attendance", tags=["admin-attendance"])


def _safe_tz(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except Exception:
        return ZoneInfo("UTC")


def _within_window(local_dt: datetime, *, target_hour: int, target_minute: int, minutes_before: int, minutes_after: int) -> bool:
    target = local_dt.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
    delta_minutes = (local_dt - target).total_seconds() / 60.0
    return (-minutes_before) <= delta_minutes <= minutes_after


def _entry_view(entry: StaffTimeEntry, staff_tz: str) -> dict:
    tz = _safe_tz(staff_tz)
    clock_in_local = entry.clock_in_at.replace(tzinfo=timezone.utc).astimezone(tz) if entry.clock_in_at else None
    clock_out_local = entry.clock_out_at.replace(tzinfo=timezone.utc).astimezone(tz) if entry.clock_out_at else None

    clock_in_ok = bool(clock_in_local and _within_window(clock_in_local, target_hour=9, target_minute=0, minutes_before=30, minutes_after=30))
    clock_out_ok = bool(clock_out_local and _within_window(clock_out_local, target_hour=17, target_minute=0, minutes_before=30, minutes_after=30))

    day_status = "none"
    if entry.clock_in_at and not entry.clock_out_at:
        day_status = "clocked_in_ok" if clock_in_ok else "clocked_in_warn"
    elif entry.clock_in_at and entry.clock_out_at:
        day_status = "complete_ok" if (clock_in_ok and clock_out_ok) else "complete_warn"

    return {
        "id": entry.id,
        "staff_user_id": entry.staff_user_id,
        "work_date": entry.work_date.isoformat(),
        "clock_in_at": entry.clock_in_at.isoformat() if entry.clock_in_at else None,
        "clock_out_at": entry.clock_out_at.isoformat() if entry.clock_out_at else None,
        "clock_in_ok": clock_in_ok,
        "clock_out_ok": clock_out_ok,
        "day_status": day_status,
        "timezone": staff_tz or "UTC",
    }


class MonthQuery(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    staff_user_id: int | None = None


@router.get("/month")
def get_month(
    year: int,
    month: int,
    staff_user_id: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),
):
    staff_id = int(staff_user_id) if staff_user_id is not None else int(current_staff.id)
    staff = db.query(StaffUser).filter(StaffUser.id == staff_id).first()
    if not staff or not staff.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")

    start = date(int(year), int(month), 1)
    if month == 12:
        end = date(int(year) + 1, 1, 1)
    else:
        end = date(int(year), int(month) + 1, 1)

    rows = (
        db.query(StaffTimeEntry)
        .filter(StaffTimeEntry.staff_user_id == staff_id, StaffTimeEntry.work_date >= start, StaffTimeEntry.work_date < end)
        .order_by(StaffTimeEntry.work_date.asc())
        .all()
    )
    return {"items": [_entry_view(r, staff.timezone) for r in rows]}


@router.post("/clock-in")
def clock_in(
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),
):
    today = datetime.now(timezone.utc).date()
    entry = (
        db.query(StaffTimeEntry)
        .filter(StaffTimeEntry.staff_user_id == current_staff.id, StaffTimeEntry.work_date == today)
        .first()
    )
    if not entry:
        entry = StaffTimeEntry(staff_user_id=current_staff.id, work_date=today, created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        db.add(entry)
        db.flush()

    if entry.clock_in_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already clocked in for today")

    entry.clock_in_at = datetime.utcnow()
    entry.clock_in_ip = request.client.host if request.client else None
    db.commit()
    db.refresh(entry)
    return {"ok": True, "entry": _entry_view(entry, current_staff.timezone)}


@router.post("/clock-out")
def clock_out(
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),
):
    today = datetime.now(timezone.utc).date()
    entry = (
        db.query(StaffTimeEntry)
        .filter(StaffTimeEntry.staff_user_id == current_staff.id, StaffTimeEntry.work_date == today)
        .first()
    )
    if not entry or not entry.clock_in_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Clock in first")
    if entry.clock_out_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already clocked out for today")

    entry.clock_out_at = datetime.utcnow()
    entry.clock_out_ip = request.client.host if request.client else None
    db.commit()
    db.refresh(entry)
    return {"ok": True, "entry": _entry_view(entry, current_staff.timezone)}

