from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_time_entry import StaffTimeEntry
from ...models.staff_user import StaffUser
from ...models.staff_work_log import StaffWorkLog
from ...models.staff_work_log_comment import StaffWorkLogComment
from ...models.staff_work_log_reminder import StaffWorkLogReminder
from ...services.staff_rbac_service import StaffRBACService


router = APIRouter(prefix="/admin/work-logs", tags=["admin-work-logs"])


class WorkLogUpsertPayload(BaseModel):
    work_date: date | None = None
    summary: str = Field("", max_length=1200)
    tasks: list[dict] = Field(default_factory=list)
    links: list[str] = Field(default_factory=list)


def _clean_payload(payload: WorkLogUpsertPayload) -> dict:
    tasks_out: list[dict] = []
    for raw in payload.tasks[:50]:
        if not isinstance(raw, dict):
            continue
        text = str(raw.get("text") or "").strip()
        if not text:
            continue
        tasks_out.append({"text": text[:200], "done": bool(raw.get("done", False))})

    links_out: list[str] = []
    for raw in payload.links[:20]:
        s = str(raw or "").strip()
        if not s:
            continue
        links_out.append(s[:300])

    return {"summary": str(payload.summary or "").strip()[:1200], "tasks": tasks_out, "links": links_out}


def _get_permissions(request: Request, db: Session, current_staff: StaffUser) -> list[str]:
    perms = getattr(request.state, "staff_permissions", None)
    if perms is None:
        perms = StaffRBACService.get_user_permission_keys(db, current_staff.id)
        try:
            request.state.staff_permissions = perms
        except Exception:
            pass
    return perms


def _can_manage_any(perms: list[str]) -> bool:
    return StaffRBACService.has_permission(perms, "work_logs.manage") or StaffRBACService.has_permission(perms, "*")


@router.get("/month")
def get_month(
    request: Request,
    year: int,
    month: int,
    staff_user_id: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.read")),
):
    staff_id = int(staff_user_id) if staff_user_id is not None else int(current_staff.id)
    if int(staff_id) != int(current_staff.id):
        perms = _get_permissions(request, db, current_staff)
        if not _can_manage_any(perms):
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
        db.query(StaffWorkLog)
        .filter(StaffWorkLog.staff_user_id == staff_id, StaffWorkLog.work_date >= start, StaffWorkLog.work_date < end)
        .order_by(StaffWorkLog.work_date.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "staff_user_id": r.staff_user_id,
                "work_date": r.work_date.isoformat(),
                "payload": r.payload,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
    }


class WeekQuery(BaseModel):
    start: date
    staff_user_id: int | None = None


@router.get("/week")
def get_week(
    request: Request,
    start: date,
    staff_user_id: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.read")),
):
    staff_id = int(staff_user_id) if staff_user_id is not None else int(current_staff.id)
    perms = _get_permissions(request, db, current_staff)
    if int(staff_id) != int(current_staff.id) and not _can_manage_any(perms):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    staff = db.query(StaffUser).filter(StaffUser.id == staff_id).first()
    if not staff or not staff.is_active or getattr(staff, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")

    start_date = start
    end_date = start_date + timedelta(days=7)

    logs = (
        db.query(StaffWorkLog)
        .filter(
            StaffWorkLog.staff_user_id == staff_id,
            StaffWorkLog.work_date >= start_date,
            StaffWorkLog.work_date < end_date,
        )
        .all()
    )
    logs_by_date: dict[str, StaffWorkLog] = {r.work_date.isoformat(): r for r in logs}

    attendance_rows = (
        db.query(StaffTimeEntry)
        .filter(
            StaffTimeEntry.staff_user_id == staff_id,
            StaffTimeEntry.work_date >= start_date,
            StaffTimeEntry.work_date < end_date,
        )
        .all()
    )
    attendance_by_date: dict[str, StaffTimeEntry] = {r.work_date.isoformat(): r for r in attendance_rows}

    reminder_rows = (
        db.query(StaffWorkLogReminder)
        .filter(
            StaffWorkLogReminder.staff_user_id == staff_id,
            StaffWorkLogReminder.work_date >= start_date,
            StaffWorkLogReminder.work_date < end_date,
        )
        .all()
    )
    reminders_by_date: dict[str, StaffWorkLogReminder] = {r.work_date.isoformat(): r for r in reminder_rows}

    # comment counts keyed by work_log_id
    work_log_ids = [int(r.id) for r in logs]
    comment_counts: dict[int, int] = {}
    if work_log_ids:
        rows = (
            db.query(StaffWorkLogComment.work_log_id, StaffWorkLogComment.id)
            .filter(StaffWorkLogComment.work_log_id.in_(work_log_ids))
            .all()
        )
        for wid, _cid in rows:
            comment_counts[int(wid)] = int(comment_counts.get(int(wid), 0)) + 1

    days: list[dict] = []
    logs_written = 0
    missing_logs = 0
    tasks_total = 0
    tasks_done = 0
    comments_total = 0
    reminders_total = 0

    for i in range(7):
        d = start_date + timedelta(days=i)
        key = d.isoformat()
        log = logs_by_date.get(key)
        att = attendance_by_date.get(key)
        reminded = reminders_by_date.get(key)

        has_attendance = bool(att and att.clock_in_at)
        has_log = bool(log)
        missing = bool(has_attendance and not has_log)

        if has_log:
            logs_written += 1
            payload = log.payload if isinstance(log.payload, dict) else {}
            tasks = payload.get("tasks") if isinstance(payload, dict) else None
            tasks = tasks if isinstance(tasks, list) else []
            tasks_total += len(tasks)
            tasks_done += sum(1 for t in tasks if isinstance(t, dict) and bool(t.get("done")))
            c = int(comment_counts.get(int(log.id), 0))
            comments_total += c
        else:
            payload = None
            c = 0

        if missing:
            missing_logs += 1
        if reminded:
            reminders_total += 1

        days.append(
            {
                "work_date": key,
                "attendance": {
                    "clock_in_at": att.clock_in_at.isoformat() if (att and att.clock_in_at) else None,
                    "clock_out_at": att.clock_out_at.isoformat() if (att and att.clock_out_at) else None,
                }
                if att
                else None,
                "work_log": {
                    "id": log.id,
                    "payload": payload,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                    "updated_at": log.updated_at.isoformat() if log.updated_at else None,
                }
                if log
                else None,
                "missing_log": missing,
                "comments_count": c,
                "reminder": {
                    "id": reminded.id,
                    "message": reminded.message,
                    "created_at": reminded.created_at.isoformat() if reminded.created_at else None,
                    "created_by_staff_user_id": reminded.created_by_staff_user_id,
                }
                if reminded
                else None,
            }
        )

    return {
        "staff_user_id": staff.id,
        "email": staff.email,
        "week_start": start_date.isoformat(),
        "week_end": (end_date - timedelta(days=1)).isoformat(),
        "summary": {
            "logs_written": logs_written,
            "missing_logs": missing_logs,
            "tasks_total": tasks_total,
            "tasks_done": tasks_done,
            "comments_total": comments_total,
            "reminders_total": reminders_total,
        },
        "days": days,
    }


class CommentCreatePayload(BaseModel):
    comment: str = Field(..., min_length=1, max_length=1000)


@router.get("/{work_log_id}")
def get_work_log(
    request: Request,
    work_log_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.read")),
):
    row = db.query(StaffWorkLog).filter(StaffWorkLog.id == int(work_log_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    perms = _get_permissions(request, db, current_staff)
    if int(row.staff_user_id) != int(current_staff.id) and not _can_manage_any(perms):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    comments = (
        db.query(StaffWorkLogComment)
        .filter(StaffWorkLogComment.work_log_id == int(row.id))
        .order_by(StaffWorkLogComment.created_at.asc())
        .all()
    )
    return {
        "id": row.id,
        "staff_user_id": row.staff_user_id,
        "work_date": row.work_date.isoformat(),
        "payload": row.payload,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "comments": [
            {
                "id": c.id,
                "author_staff_user_id": c.author_staff_user_id,
                "comment": c.comment,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in comments
        ],
    }


@router.post("/{work_log_id}/comments")
def add_comment(
    request: Request,
    work_log_id: int,
    payload: CommentCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    row = db.query(StaffWorkLog).filter(StaffWorkLog.id == int(work_log_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    comment = StaffWorkLogComment(
        work_log_id=int(row.id),
        author_staff_user_id=int(current_staff.id),
        comment=payload.comment.strip()[:1000],
        created_at=datetime.utcnow(),
    )
    db.add(comment)
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_logs.comment.add",
            entity="staff_work_logs",
            entity_id=str(row.id),
            details={"staff_user_id": int(row.staff_user_id), "work_date": row.work_date.isoformat()},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(comment)
    return {"ok": True, "id": comment.id}


class ReminderCreatePayload(BaseModel):
    staff_user_id: int
    work_date: date
    message: str | None = Field(None, max_length=240)


@router.post("/reminders")
def upsert_reminder(
    request: Request,
    payload: ReminderCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    staff = db.query(StaffUser).filter(StaffUser.id == int(payload.staff_user_id)).first()
    if not staff or not staff.is_active or getattr(staff, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")

    msg = payload.message.strip()[:240] if isinstance(payload.message, str) and payload.message.strip() else "Reminder: please submit your work log"

    existing = (
        db.query(StaffWorkLogReminder)
        .filter(
            and_(
                StaffWorkLogReminder.staff_user_id == int(payload.staff_user_id),
                StaffWorkLogReminder.work_date == payload.work_date,
            )
        )
        .first()
    )
    if not existing:
        existing = StaffWorkLogReminder(
            staff_user_id=int(payload.staff_user_id),
            work_date=payload.work_date,
            created_by_staff_user_id=int(current_staff.id),
            message=msg,
            created_at=datetime.utcnow(),
        )
        db.add(existing)
    else:
        existing.created_by_staff_user_id = int(current_staff.id)
        existing.message = msg
        existing.created_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_logs.reminder.upsert",
            entity="staff_work_log_reminders",
            entity_id=f"{payload.staff_user_id}:{payload.work_date.isoformat()}",
            details={"staff_user_id": int(payload.staff_user_id), "work_date": payload.work_date.isoformat()},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )

    db.commit()
    return {"ok": True}


@router.post("/upsert")
def upsert_work_log(
    payload: WorkLogUpsertPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.write")),
):
    work_date = payload.work_date or datetime.now(timezone.utc).date()
    row = (
        db.query(StaffWorkLog)
        .filter(StaffWorkLog.staff_user_id == current_staff.id, StaffWorkLog.work_date == work_date)
        .first()
    )
    cleaned = _clean_payload(payload)
    if not row:
        row = StaffWorkLog(
            staff_user_id=current_staff.id,
            work_date=work_date,
            payload=cleaned,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(row)
    else:
        row.payload = cleaned
        row.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id}
