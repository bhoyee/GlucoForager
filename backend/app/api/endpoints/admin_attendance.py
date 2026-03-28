from __future__ import annotations

from datetime import date, datetime, timezone, timedelta, time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_staff_user, require_staff_permission
from ...database import get_db
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_time_entry import StaffTimeEntry
from ...models.staff_user import StaffUser
from ...services.staff_rbac_service import StaffRBACService


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
        "edited_at": entry.edited_at.isoformat() if entry.edited_at else None,
        "edited_by_staff_user_id": entry.edited_by_staff_user_id,
        "edit_reason": entry.edit_reason,
        "approved_at": entry.approved_at.isoformat() if getattr(entry, "approved_at", None) else None,
        "approved_by_staff_user_id": getattr(entry, "approved_by_staff_user_id", None),
        "approval_reason": getattr(entry, "approval_reason", None),
    }


class MonthQuery(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    staff_user_id: int | None = None


@router.get("/month")
def get_month(
    request: Request,
    year: int,
    month: int,
    staff_user_id: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("attendance.read")),
):
    staff_id = int(staff_user_id) if staff_user_id is not None else int(current_staff.id)
    if int(staff_id) != int(current_staff.id):
        perms = getattr(request.state, "staff_permissions", None)
        if not perms:
            perms = StaffRBACService.get_user_permission_keys(db, current_staff.id)
        if not (StaffRBACService.has_permission(perms, "attendance.manage") or StaffRBACService.has_permission(perms, "*")):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    staff = db.query(StaffUser).filter(StaffUser.id == staff_id).first()
    if not staff or not staff.is_active or getattr(staff, "deleted_at", None) is not None:
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
    current_staff: StaffUser = Depends(require_staff_permission("attendance.write")),
):
    today = datetime.now(timezone.utc).date()
    created_entry = False
    entry = (
        db.query(StaffTimeEntry)
        .filter(StaffTimeEntry.staff_user_id == current_staff.id, StaffTimeEntry.work_date == today)
        .first()
    )
    if not entry:
        entry = StaffTimeEntry(staff_user_id=current_staff.id, work_date=today, created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        db.add(entry)
        db.flush()
        created_entry = True

    if entry.clock_in_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already clocked in for today")

    entry.clock_in_at = datetime.utcnow()
    entry.clock_in_ip = request.client.host if request.client else None
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="attendance.clock_in",
            entity="staff_time_entries",
            entity_id=str(entry.id),
            details={
                "work_date": today.isoformat(),
                "clock_in_at": entry.clock_in_at.isoformat() if entry.clock_in_at else None,
                "created_entry": bool(created_entry),
            },
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(entry)
    return {"ok": True, "entry": _entry_view(entry, current_staff.timezone)}


@router.post("/clock-out")
def clock_out(
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("attendance.write")),
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
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="attendance.clock_out",
            entity="staff_time_entries",
            entity_id=str(entry.id),
            details={
                "work_date": today.isoformat(),
                "clock_out_at": entry.clock_out_at.isoformat() if entry.clock_out_at else None,
            },
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(entry)
    return {"ok": True, "entry": _entry_view(entry, current_staff.timezone)}


class AttendanceEditPayload(BaseModel):
    clock_in_at: str | None = None
    clock_out_at: str | None = None
    reason: str | None = Field(None, max_length=240)


@router.patch("/entries/{entry_id}")
def edit_entry(
    request: Request,
    entry_id: int,
    payload: AttendanceEditPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("attendance.manage")),
):
    entry = db.query(StaffTimeEntry).filter(StaffTimeEntry.id == int(entry_id)).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    def _parse_dt(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid datetime format")
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    new_in = _parse_dt(payload.clock_in_at) if payload.clock_in_at is not None else entry.clock_in_at
    new_out = _parse_dt(payload.clock_out_at) if payload.clock_out_at is not None else entry.clock_out_at
    if new_in and new_out and new_out < new_in:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="clock_out_at must be after clock_in_at")

    before = {
        "clock_in_at": entry.clock_in_at.isoformat() if entry.clock_in_at else None,
        "clock_out_at": entry.clock_out_at.isoformat() if entry.clock_out_at else None,
    }
    entry.clock_in_at = new_in
    entry.clock_out_at = new_out
    entry.edited_at = datetime.utcnow()
    entry.edited_by_staff_user_id = int(current_staff.id)
    entry.edit_reason = (payload.reason.strip()[:240] if isinstance(payload.reason, str) and payload.reason.strip() else None)
    entry.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="attendance.edit",
            entity="staff_time_entries",
            entity_id=str(entry.id),
            details={"before": before, "after": {"clock_in_at": new_in.isoformat() if new_in else None, "clock_out_at": new_out.isoformat() if new_out else None}},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(entry)
    # Show values in the edited staff user's timezone (not HR's timezone).
    staff = db.query(StaffUser).filter(StaffUser.id == int(entry.staff_user_id)).first()
    return {"ok": True, "entry": _entry_view(entry, (staff.timezone if staff else "UTC"))}


class ApproveMissedClockOutPayload(BaseModel):
    clock_out_at: str | None = None
    reason: str | None = Field(None, max_length=240)


@router.post("/entries/{entry_id}/approve-missed-clock-out")
def approve_missed_clock_out(
    request: Request,
    entry_id: int,
    payload: ApproveMissedClockOutPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("attendance.manage")),
):
    entry = db.query(StaffTimeEntry).filter(StaffTimeEntry.id == int(entry_id)).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not entry.clock_in_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot approve: missing clock-in")
    if entry.clock_out_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already clocked out")

    staff = db.query(StaffUser).filter(StaffUser.id == int(entry.staff_user_id)).first()
    staff_tz = staff.timezone if staff and staff.timezone else "UTC"

    def _parse_dt(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid datetime format")
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    clock_out = _parse_dt(payload.clock_out_at)
    if not clock_out:
        tz = _safe_tz(staff_tz)
        local_out = datetime.combine(entry.work_date, time(17, 0), tzinfo=tz)
        clock_out = local_out.astimezone(timezone.utc).replace(tzinfo=None)

    if clock_out <= entry.clock_in_at:
        # Fallback to a reasonable default shift length if the tz-based 17:00 is earlier than clock-in.
        clock_out = entry.clock_in_at + timedelta(hours=8)

    reason = (payload.reason.strip()[:240] if isinstance(payload.reason, str) and payload.reason.strip() else "HR approval: missed clock-out")

    before = {
        "clock_out_at": entry.clock_out_at.isoformat() if entry.clock_out_at else None,
        "approved_at": entry.approved_at.isoformat() if getattr(entry, "approved_at", None) else None,
    }

    entry.clock_out_at = clock_out
    entry.clock_out_ip = request.client.host if request.client else None
    entry.edited_at = datetime.utcnow()
    entry.edited_by_staff_user_id = int(current_staff.id)
    entry.edit_reason = reason
    entry.approved_at = datetime.utcnow()
    entry.approved_by_staff_user_id = int(current_staff.id)
    entry.approval_reason = reason
    entry.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="attendance.approve_missed_clock_out",
            entity="staff_time_entries",
            entity_id=str(entry.id),
            details={
                "before": before,
                "after": {
                    "clock_out_at": clock_out.isoformat() if clock_out else None,
                    "approved_at": entry.approved_at.isoformat() if entry.approved_at else None,
                },
                "reason": reason,
            },
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )

    db.commit()
    db.refresh(entry)
    return {"ok": True, "entry": _entry_view(entry, staff_tz)}
