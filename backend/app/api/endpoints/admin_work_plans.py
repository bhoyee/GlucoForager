from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, text as sa_text
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_assigned_task import StaffAssignedTask
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_notification import StaffNotification
from ...models.staff_role_milestone import StaffRoleMilestone
from ...models.staff_user import StaffUser
from ...models.staff_milestone_progress import StaffMilestoneProgress
from ...models.staff_work_log import StaffWorkLog
from ...services.email_service import send_staff_notification_email
from ...services.staff_rbac_service import StaffRBACService


router = APIRouter(prefix="/admin/work-plans", tags=["admin-work-plans"])


def _staff_portal_url(request: Request) -> str:
    # Prefer explicit env config, then request origin (dev), then SITE_URL.
    try:
        from ...core.config import settings  # local import to avoid circular imports

        base = (settings.staff_portal_url or "").strip().rstrip("/")
        if base:
            return base
        origin = (request.headers.get("origin") or "").strip().rstrip("/")
        if origin:
            return f"{origin}/admin"
        return f"{str(settings.site_url).strip().rstrip('/')}/admin"
    except Exception:
        origin = (request.headers.get("origin") or "").strip().rstrip("/")
        return f"{origin}/admin" if origin else "/admin"


def _work_log_link(request: Request, work_date: date) -> str:
    base = _staff_portal_url(request).rstrip("/")
    return f"{base}/work-logs?date={work_date.isoformat()}"


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _monday_of_week(d: date) -> date:
    # Monday = 0 ... Sunday = 6
    return d - timedelta(days=int(d.weekday()))


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def _month_end_exclusive(d: date) -> date:
    if d.month == 12:
        return date(d.year + 1, 1, 1)
    return date(d.year, d.month + 1, 1)


def _is_work_log_submitted(db: Session, staff_user_id: int, work_date: date) -> bool:
    return (
        db.query(StaffWorkLog.id)
        .filter(StaffWorkLog.staff_user_id == int(staff_user_id), StaffWorkLog.work_date == work_date)
        .first()
        is not None
    )


def _clean_links(raw: list[str] | None, *, max_items: int) -> list[str]:
    out: list[str] = []
    for s in (raw or [])[:max_items]:
        v = str(s or "").strip()
        if not v:
            continue
        out.append(v[:300])
    return out


class TaskAssignPayload(BaseModel):
    staff_user_id: int
    work_date: date
    # Allow multi-line tasks and longer instructions from managers/admins.
    text: str = Field(..., min_length=1, max_length=4000)

class TaskAssignRolePayload(BaseModel):
    role_key: str = Field(..., min_length=2, max_length=40)
    work_date: date
    # Allow multi-line tasks and longer instructions from managers/admins.
    text: str = Field(..., min_length=1, max_length=4000)


class TaskSelfAddPayload(BaseModel):
    work_date: date
    text: str = Field(..., min_length=1, max_length=4000)


class TaskCompletePayload(BaseModel):
    is_completed: bool = True
    completion_note: str | None = Field(None, max_length=1000)
    proof_links: list[str] = Field(default_factory=list)


class TaskUpdatePayload(BaseModel):
    work_date: date | None = None
    text: str = Field(..., min_length=1, max_length=4000)


class MilestoneCreatePayload(BaseModel):
    role_key: str = Field(..., min_length=2, max_length=40)
    cadence: str = Field(..., min_length=3, max_length=12)  # weekly|monthly
    period_start: date
    title: str = Field(..., min_length=1, max_length=140)
    description: str | None = Field(None, max_length=800)


class MilestoneCompletePayload(BaseModel):
    is_completed: bool = True

class MilestoneUpdatePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=140)
    description: str | None = Field(None, max_length=800)

class MilestoneSelfCompletePayload(BaseModel):
    is_completed: bool = True
    completion_note: str | None = Field(None, max_length=240)
    proof_links: list[str] = Field(default_factory=list)


@router.get("/picklists")
def picklists(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),  # noqa: ARG001
):
    roles = db.execute(sa_text("SELECT key, name FROM staff_roles ORDER BY name ASC, key ASC")).fetchall()
    staff = (
        db.query(StaffUser)
        .filter(StaffUser.is_active.is_(True), StaffUser.deleted_at.is_(None))
        .order_by(StaffUser.email.asc())
        .limit(800)
        .all()
    )

    return {
        "roles": [{"key": str(r[0]), "name": str(r[1])} for r in roles if r and r[0] and r[1]],
        "staff": [
            {
                "id": int(u.id),
                "email": u.email,
                "full_name": getattr(u, "full_name", None),
                "employee_code": getattr(u, "employee_code", None),
            }
            for u in staff
        ],
    }


@router.get("/my")
def my_plan(
    work_date: date | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.read")),
):
    d = work_date or _utc_today()
    roles = StaffRBACService.get_user_role_keys(db, int(current_staff.id))

    tasks = (
        db.query(StaffAssignedTask)
        .filter(
            StaffAssignedTask.staff_user_id == int(current_staff.id),
            StaffAssignedTask.work_date == d,
            StaffAssignedTask.deleted_at.is_(None),
        )
        .order_by(StaffAssignedTask.id.asc())
        .all()
    )

    week_start = _monday_of_week(d)
    week_end_ex = week_start + timedelta(days=7)
    month_start = _month_start(d)
    month_end_ex = _month_end_exclusive(d)

    weekly = (
        db.query(StaffRoleMilestone)
        .filter(
            StaffRoleMilestone.deleted_at.is_(None),
            StaffRoleMilestone.cadence == "weekly",
            StaffRoleMilestone.period_start >= week_start,
            StaffRoleMilestone.period_start < week_end_ex,
            StaffRoleMilestone.role_key.in_(roles) if roles else False,
        )
        .order_by(StaffRoleMilestone.role_key.asc(), StaffRoleMilestone.id.asc())
        .all()
        if roles
        else []
    )

    monthly = (
        db.query(StaffRoleMilestone)
        .filter(
            StaffRoleMilestone.deleted_at.is_(None),
            StaffRoleMilestone.cadence == "monthly",
            StaffRoleMilestone.period_start < month_end_ex,
            StaffRoleMilestone.period_start >= month_start,
            StaffRoleMilestone.role_key.in_(roles) if roles else False,
        )
        .order_by(StaffRoleMilestone.role_key.asc(), StaffRoleMilestone.id.asc())
        .all()
        if roles
        else []
    )

    milestone_ids = [int(m.id) for m in (weekly + monthly)]
    progress_by_mid: dict[int, StaffMilestoneProgress] = {}
    if milestone_ids:
        rows = (
            db.query(StaffMilestoneProgress)
            .filter(
                StaffMilestoneProgress.staff_user_id == int(current_staff.id),
                StaffMilestoneProgress.milestone_id.in_(milestone_ids),
            )
            .all()
        )
        progress_by_mid = {int(r.milestone_id): r for r in rows}

    return {
        "work_date": d.isoformat(),
        "roles": roles,
        "tasks": [
            {
                "id": t.id,
                "staff_user_id": t.staff_user_id,
                "assigned_by_staff_user_id": t.assigned_by_staff_user_id,
                "work_date": t.work_date.isoformat(),
                "text": t.text,
                "is_completed": bool(t.is_completed),
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                "completion_note": t.completion_note,
                "proof_links": t.proof_links if isinstance(t.proof_links, list) else [],
            }
            for t in tasks
        ],
        "milestones": {
            "weekly": [
                {
                    "id": m.id,
                    "role_key": m.role_key,
                    "period_start": m.period_start.isoformat(),
                    "title": m.title,
                    "description": m.description,
                    "is_completed": bool(m.is_completed),
                    "my_is_completed": bool(progress_by_mid.get(int(m.id)).is_completed) if progress_by_mid.get(int(m.id)) else False,
                    "my_completed_at": progress_by_mid.get(int(m.id)).completed_at.isoformat() if (progress_by_mid.get(int(m.id)) and progress_by_mid.get(int(m.id)).completed_at) else None,
                    "my_completion_note": progress_by_mid.get(int(m.id)).completion_note if progress_by_mid.get(int(m.id)) else None,
                    "my_proof_links": progress_by_mid.get(int(m.id)).proof_links if (progress_by_mid.get(int(m.id)) and isinstance(progress_by_mid.get(int(m.id)).proof_links, list)) else [],
                }
                for m in weekly
            ],
            "monthly": [
                {
                    "id": m.id,
                    "role_key": m.role_key,
                    "period_start": m.period_start.isoformat(),
                    "title": m.title,
                    "description": m.description,
                    "is_completed": bool(m.is_completed),
                    "my_is_completed": bool(progress_by_mid.get(int(m.id)).is_completed) if progress_by_mid.get(int(m.id)) else False,
                    "my_completed_at": progress_by_mid.get(int(m.id)).completed_at.isoformat() if (progress_by_mid.get(int(m.id)) and progress_by_mid.get(int(m.id)).completed_at) else None,
                    "my_completion_note": progress_by_mid.get(int(m.id)).completion_note if progress_by_mid.get(int(m.id)) else None,
                    "my_proof_links": progress_by_mid.get(int(m.id)).proof_links if (progress_by_mid.get(int(m.id)) and isinstance(progress_by_mid.get(int(m.id)).proof_links, list)) else [],
                }
                for m in monthly
            ],
        },
    }


@router.post("/tasks/assign")
def assign_task(
    request: Request,
    payload: TaskAssignPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    staff = db.query(StaffUser).filter(StaffUser.id == int(payload.staff_user_id)).first()
    if not staff or not staff.is_active or getattr(staff, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")

    task_text = payload.text.strip()
    row = StaffAssignedTask(
        staff_user_id=int(payload.staff_user_id),
        assigned_by_staff_user_id=int(current_staff.id),
        work_date=payload.work_date,
        text=task_text,
        is_completed=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        proof_links=[],
    )
    db.add(row)
    db.flush()

    db.add(
        StaffNotification(
            staff_user_id=int(payload.staff_user_id),
            type="task.assigned",
            title=f"New task for {payload.work_date.isoformat()}",
            body=task_text[:240],
            data={"task_id": int(row.id), "work_date": payload.work_date.isoformat()},
            read_at=None,
            created_at=datetime.utcnow(),
        )
    )
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.task.assign",
            entity="staff_assigned_tasks",
            entity_id=str(row.id),
            details={"staff_user_id": int(payload.staff_user_id), "work_date": payload.work_date.isoformat()},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()

    # Best-effort email notification.
    try:
        send_staff_notification_email(
            to_email=str(staff.email),
            title=f"New task for {payload.work_date.isoformat()}",
            body=f"{task_text}\n\nOpen: {_work_log_link(request, payload.work_date)}",
        )
    except Exception:
        pass
    return {"ok": True, "id": row.id}


@router.post("/tasks/assign-role")
def assign_task_to_role(
    request: Request,
    payload: TaskAssignRolePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    role_key = payload.role_key.strip().lower()
    task_text = payload.text.strip()

    # Get active staff ids for this role key.
    rows = db.execute(
        sa_text(
            """
        SELECT su.id, su.email
        FROM staff_users su
        JOIN staff_user_roles ur ON ur.user_id = su.id
        JOIN staff_roles r ON r.id = ur.role_id
        WHERE r.key = :rk
          AND su.is_active = true
          AND su.deleted_at IS NULL
        """
        ),
        {"rk": role_key},
    ).fetchall()
    staff_id_to_email = {int(r[0]): str(r[1]) for r in rows if r and r[0] is not None and r[1]}
    staff_ids = list(staff_id_to_email.keys())
    if not staff_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active staff found for that role")

    created_ids: list[int] = []
    for staff_id in staff_ids:
        row = StaffAssignedTask(
            staff_user_id=int(staff_id),
            assigned_by_staff_user_id=int(current_staff.id),
            work_date=payload.work_date,
            text=task_text,
            is_completed=False,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            proof_links=[],
        )
        db.add(row)
        db.flush()
        created_ids.append(int(row.id))

        db.add(
            StaffNotification(
                staff_user_id=int(staff_id),
                type="task.assigned",
                title=f"New task for {payload.work_date.isoformat()}",
                body=task_text[:240],
                data={"task_id": int(row.id), "work_date": payload.work_date.isoformat()},
                read_at=None,
                created_at=datetime.utcnow(),
            )
        )

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.task.assign_role",
            entity="staff_assigned_tasks",
            entity_id=f"role:{role_key}:{payload.work_date.isoformat()}",
            details={"role_key": role_key, "work_date": payload.work_date.isoformat(), "count": len(created_ids)},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()

    # Best-effort email notifications (bulk).
    link = _work_log_link(request, payload.work_date)
    for sid in staff_ids:
        to_email = staff_id_to_email.get(int(sid))
        if not to_email:
            continue
        try:
            send_staff_notification_email(
                to_email=str(to_email),
                title=f"New task for {payload.work_date.isoformat()}",
                body=f"{task_text}\n\nOpen: {link}",
            )
        except Exception:
            pass
    return {"ok": True, "count": len(created_ids), "ids": created_ids}


@router.post("/tasks/self-add")
def add_self_task(
    request: Request,
    payload: TaskSelfAddPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.write")),
):
    if _is_work_log_submitted(db, int(current_staff.id), payload.work_date):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Work log already submitted for this date. Tasks are read-only.")

    task_text = payload.text.strip()
    row = StaffAssignedTask(
        staff_user_id=int(current_staff.id),
        assigned_by_staff_user_id=int(current_staff.id),
        work_date=payload.work_date,
        text=task_text,
        is_completed=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        proof_links=[],
    )
    db.add(row)
    db.flush()
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.task.self_add",
            entity="staff_assigned_tasks",
            entity_id=str(row.id),
            details={"work_date": payload.work_date.isoformat()},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True, "id": row.id}


@router.get("/tasks")
def list_tasks(
    start: date,
    end: date,
    staff_user_id: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    query = db.query(StaffAssignedTask).filter(
        StaffAssignedTask.deleted_at.is_(None),
        StaffAssignedTask.work_date >= start,
        StaffAssignedTask.work_date <= end,
    )
    if staff_user_id is not None:
        query = query.filter(StaffAssignedTask.staff_user_id == int(staff_user_id))

    rows = query.order_by(StaffAssignedTask.work_date.desc(), StaffAssignedTask.id.desc()).limit(500).all()
    return {
        "items": [
            {
                "id": r.id,
                "staff_user_id": r.staff_user_id,
                "work_date": r.work_date.isoformat(),
                "text": r.text,
                "is_completed": bool(r.is_completed),
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "completion_note": r.completion_note,
                "proof_links": r.proof_links if isinstance(r.proof_links, list) else [],
                "assigned_by_staff_user_id": r.assigned_by_staff_user_id,
            }
            for r in rows
        ]
    }


@router.get("/tasks/by-date")
def tasks_by_date(
    work_date: date,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),  # noqa: ARG001
):
    rows = (
        db.query(StaffAssignedTask, StaffUser)
        .join(StaffUser, StaffUser.id == StaffAssignedTask.staff_user_id)
        .filter(
            StaffAssignedTask.deleted_at.is_(None),
            StaffAssignedTask.work_date == work_date,
            StaffUser.is_active.is_(True),
            StaffUser.deleted_at.is_(None),
        )
        .order_by(StaffUser.email.asc(), StaffAssignedTask.id.asc())
        .all()
    )

    by_staff: dict[int, dict] = {}
    for task, staff in rows:
        sid = int(staff.id)
        bucket = by_staff.get(sid)
        if not bucket:
            bucket = {
                "staff_user_id": sid,
                "email": staff.email,
                "full_name": getattr(staff, "full_name", None),
                "country": getattr(staff, "country", None),
                "tasks": [],
                "done_count": 0,
                "total_count": 0,
            }
            by_staff[sid] = bucket

        bucket["total_count"] += 1
        if bool(task.is_completed):
            bucket["done_count"] += 1
        bucket["tasks"].append(
            {
                "id": task.id,
                "text": task.text,
                "is_completed": bool(task.is_completed),
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                "completion_note": task.completion_note,
                "proof_links": task.proof_links if isinstance(task.proof_links, list) else [],
                "assigned_by_staff_user_id": task.assigned_by_staff_user_id,
            }
        )

    staff_items = list(by_staff.values())
    staff_items.sort(key=lambda x: str(x.get("email") or ""))

    return {"work_date": work_date.isoformat(), "items": staff_items}


@router.get("/tasks/by-week")
def tasks_by_week(
    start: date,
    staff_user_id: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),  # noqa: ARG001
):
    end_ex = start + timedelta(days=7)
    query = (
        db.query(StaffAssignedTask, StaffUser)
        .join(StaffUser, StaffUser.id == StaffAssignedTask.staff_user_id)
        .filter(
            StaffAssignedTask.deleted_at.is_(None),
            StaffAssignedTask.work_date >= start,
            StaffAssignedTask.work_date < end_ex,
            StaffUser.is_active.is_(True),
            StaffUser.deleted_at.is_(None),
        )
    )
    if staff_user_id is not None:
        query = query.filter(StaffAssignedTask.staff_user_id == int(staff_user_id))

    rows = query.order_by(StaffAssignedTask.work_date.desc(), StaffUser.email.asc(), StaffAssignedTask.id.asc()).all()
    return {
        "week_start": start.isoformat(),
        "week_end": (end_ex - timedelta(days=1)).isoformat(),
        "items": [
            {
                "id": task.id,
                "staff_user_id": task.staff_user_id,
                "staff_email": staff.email,
                "work_date": task.work_date.isoformat(),
                "text": task.text,
                "is_completed": bool(task.is_completed),
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                "completion_note": task.completion_note,
                "proof_links": task.proof_links if isinstance(task.proof_links, list) else [],
                "assigned_by_staff_user_id": task.assigned_by_staff_user_id,
            }
            for task, staff in rows
        ],
    }


@router.post("/tasks/{task_id}/complete")
def complete_task(
    request: Request,
    task_id: int,
    payload: TaskCompletePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.write")),
):
    row = (
        db.query(StaffAssignedTask)
        .filter(StaffAssignedTask.id == int(task_id), StaffAssignedTask.deleted_at.is_(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if int(row.staff_user_id) != int(current_staff.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    if _is_work_log_submitted(db, int(current_staff.id), row.work_date):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Work log already submitted for this date. Tasks are read-only.")

    want_completed = bool(payload.is_completed)
    # Proof links are optional (some tasks don't have a URL-based proof).
    # Keep the field for when staff have links, but don't block completion.

    row.is_completed = want_completed
    if want_completed:
        row.completed_at = datetime.utcnow()
        row.completed_by_staff_user_id = int(current_staff.id)
    else:
        row.completed_at = None
        row.completed_by_staff_user_id = None
        row.proof_links = []
        row.completion_note = None

    row.proof_links = _clean_links(payload.proof_links, max_items=8) if want_completed else []
    row.completion_note = payload.completion_note.strip()[:240] if isinstance(payload.completion_note, str) and payload.completion_note.strip() else None
    row.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.task.complete",
            entity="staff_assigned_tasks",
            entity_id=str(row.id),
            details={"work_date": row.work_date.isoformat(), "is_completed": bool(row.is_completed)},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}


@router.post("/milestones")
def create_milestone(
    request: Request,
    payload: MilestoneCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    role_key = payload.role_key.strip().lower()
    cadence = payload.cadence.strip().lower()
    if cadence not in ("weekly", "monthly"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="cadence must be weekly or monthly")

    row = StaffRoleMilestone(
        role_key=role_key,
        cadence=cadence,
        period_start=payload.period_start,
        period_end=None,
        title=payload.title.strip()[:140],
        description=payload.description.strip()[:800] if isinstance(payload.description, str) and payload.description.strip() else None,
        is_completed=False,
        created_by_staff_user_id=int(current_staff.id),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.milestone.create",
            entity="staff_role_milestones",
            entity_id=str(row.id),
            details={"role_key": role_key, "cadence": cadence, "period_start": payload.period_start.isoformat()},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True, "id": row.id}


@router.get("/milestones")
def list_milestones(
    role_key: str,
    cadence: str,
    period_start: date,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    rk = role_key.strip().lower()
    cd = cadence.strip().lower()
    rows = (
        db.query(StaffRoleMilestone)
        .filter(
            StaffRoleMilestone.deleted_at.is_(None),
            StaffRoleMilestone.role_key == rk,
            StaffRoleMilestone.cadence == cd,
            StaffRoleMilestone.period_start == period_start,
        )
        .order_by(StaffRoleMilestone.id.asc())
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "role_key": r.role_key,
                "cadence": r.cadence,
                "period_start": r.period_start.isoformat(),
                "title": r.title,
                "description": r.description,
                "is_completed": bool(r.is_completed),
            }
            for r in rows
        ]
    }


@router.post("/milestones/{milestone_id}/complete")
def complete_milestone(
    request: Request,
    milestone_id: int,
    payload: MilestoneCompletePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    row = (
        db.query(StaffRoleMilestone)
        .filter(StaffRoleMilestone.id == int(milestone_id), StaffRoleMilestone.deleted_at.is_(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    want_completed = bool(payload.is_completed)
    row.is_completed = want_completed
    if want_completed:
        row.completed_at = datetime.utcnow()
        row.completed_by_staff_user_id = int(current_staff.id)
    else:
        row.completed_at = None
        row.completed_by_staff_user_id = None
    row.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.milestone.complete",
            entity="staff_role_milestones",
            entity_id=str(row.id),
            details={"role_key": row.role_key, "cadence": row.cadence, "is_completed": bool(row.is_completed)},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}


@router.post("/milestones/{milestone_id}/self-complete")
def self_complete_milestone(
    request: Request,
    milestone_id: int,
    payload: MilestoneSelfCompletePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.write")),
):
    milestone = (
        db.query(StaffRoleMilestone)
        .filter(StaffRoleMilestone.id == int(milestone_id), StaffRoleMilestone.deleted_at.is_(None))
        .first()
    )
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    # Must match one of the user's roles.
    roles = StaffRBACService.get_user_role_keys(db, int(current_staff.id))
    if str(milestone.role_key) not in set(roles or []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    want_completed = bool(payload.is_completed)
    clean_links = _clean_links(payload.proof_links, max_items=8)
    if want_completed and not clean_links:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Add at least one proof link before marking done.")

    row = (
        db.query(StaffMilestoneProgress)
        .filter(
            StaffMilestoneProgress.staff_user_id == int(current_staff.id),
            StaffMilestoneProgress.milestone_id == int(milestone.id),
        )
        .first()
    )
    if not row:
        row = StaffMilestoneProgress(
            staff_user_id=int(current_staff.id),
            milestone_id=int(milestone.id),
            is_completed=False,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            proof_links=[],
        )
        db.add(row)

    row.is_completed = want_completed
    if want_completed:
        row.completed_at = datetime.utcnow()
        row.proof_links = clean_links
        row.completion_note = payload.completion_note.strip()[:240] if isinstance(payload.completion_note, str) and payload.completion_note.strip() else None
    else:
        row.completed_at = None
        row.proof_links = []
        row.completion_note = None
    row.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.milestone.self_complete",
            entity="staff_milestone_progress",
            entity_id=f"{current_staff.id}:{milestone.id}",
            details={"milestone_id": int(milestone.id), "is_completed": bool(want_completed)},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}


@router.get("/milestones/progress")
def milestone_progress(
    role_key: str,
    cadence: str,
    period_start: date,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),  # noqa: ARG001
):
    rk = role_key.strip().lower()
    cd = cadence.strip().lower()
    ps = period_start
    if cd == "weekly":
        ps = _monday_of_week(period_start)
    elif cd == "monthly":
        ps = _month_start(period_start)
    milestones = (
        db.query(StaffRoleMilestone)
        .filter(
            StaffRoleMilestone.deleted_at.is_(None),
            StaffRoleMilestone.role_key == rk,
            StaffRoleMilestone.cadence == cd,
            StaffRoleMilestone.period_start == ps,
        )
        .order_by(StaffRoleMilestone.id.asc())
        .all()
    )
    # total staff in role (active)
    staff_rows = db.execute(
        sa_text(
            """
            SELECT COUNT(*)
            FROM staff_users su
            JOIN staff_user_roles ur ON ur.user_id = su.id
            JOIN staff_roles r ON r.id = ur.role_id
            WHERE r.key = :rk
              AND su.is_active = true
              AND su.deleted_at IS NULL
            """
        ),
        {"rk": rk},
    ).fetchone()
    total_staff = int(staff_rows[0]) if staff_rows and staff_rows[0] is not None else 0

    return {
        "role_key": rk,
        "cadence": cd,
        "period_start": ps.isoformat(),
        "total_staff": total_staff,
        "items": [
            {
                "id": m.id,
                "title": m.title,
                "description": m.description,
                "is_completed": bool(m.is_completed),
                "completed_at": m.completed_at.isoformat() if m.completed_at else None,
                "completed_by_staff_user_id": int(m.completed_by_staff_user_id) if m.completed_by_staff_user_id else None,
            }
            for m in milestones
        ],
    }


@router.get("/milestones/{milestone_id}/progress-detail")
def milestone_progress_detail(
    milestone_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),  # noqa: ARG001
):
    milestone = (
        db.query(StaffRoleMilestone)
        .filter(StaffRoleMilestone.id == int(milestone_id), StaffRoleMilestone.deleted_at.is_(None))
        .first()
    )
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    rows = (
        db.query(StaffMilestoneProgress, StaffUser)
        .join(StaffUser, StaffUser.id == StaffMilestoneProgress.staff_user_id)
        .filter(StaffMilestoneProgress.milestone_id == int(milestone.id))
        .order_by(StaffMilestoneProgress.is_completed.desc(), StaffMilestoneProgress.completed_at.desc().nullslast(), StaffUser.email.asc())
        .all()
    )
    return {
        "milestone": {
            "id": milestone.id,
            "role_key": milestone.role_key,
            "cadence": milestone.cadence,
            "period_start": milestone.period_start.isoformat(),
            "title": milestone.title,
            "description": milestone.description,
        },
        "items": [
            {
                "staff_user_id": staff.id,
                "email": staff.email,
                "full_name": getattr(staff, "full_name", None),
                "is_completed": bool(p.is_completed),
                "completed_at": p.completed_at.isoformat() if p.completed_at else None,
                "completion_note": p.completion_note,
                "proof_links": p.proof_links if isinstance(p.proof_links, list) else [],
            }
            for p, staff in rows
        ],
    }


@router.post("/milestones/{milestone_id}/update")
def update_milestone(
    request: Request,
    milestone_id: int,
    payload: MilestoneUpdatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    row = (
        db.query(StaffRoleMilestone)
        .filter(StaffRoleMilestone.id == int(milestone_id), StaffRoleMilestone.deleted_at.is_(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    before = {"title": row.title, "description": row.description}
    row.title = payload.title.strip()[:140]
    row.description = payload.description.strip()[:800] if isinstance(payload.description, str) and payload.description.strip() else None
    row.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.milestone.update",
            entity="staff_role_milestones",
            entity_id=str(row.id),
            details={"before": before, "after": {"title": row.title, "description": row.description}},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}


class CarryOverMonthlyPayload(BaseModel):
    role_key: str = Field(..., min_length=2, max_length=40)
    period_start: date  # month start (YYYY-MM-01)


@router.post("/milestones/carry-over-monthly")
def carry_over_incomplete_monthly_milestones(
    request: Request,
    payload: CarryOverMonthlyPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    rk = payload.role_key.strip().lower()
    src_start = payload.period_start
    src_end_ex = _month_end_exclusive(src_start)
    dst_start = src_end_ex

    # total active staff in role (used for "incomplete" test)
    staff_rows = db.execute(
        sa_text(
            """
            SELECT COUNT(*)
            FROM staff_users su
            JOIN staff_user_roles ur ON ur.user_id = su.id
            JOIN staff_roles r ON r.id = ur.role_id
            WHERE r.key = :rk
              AND su.is_active = true
              AND su.deleted_at IS NULL
            """
        ),
        {"rk": rk},
    ).fetchone()
    total_staff = int(staff_rows[0]) if staff_rows and staff_rows[0] is not None else 0
    if total_staff <= 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active staff found for that role")

    src = (
        db.query(StaffRoleMilestone)
        .filter(
            StaffRoleMilestone.deleted_at.is_(None),
            StaffRoleMilestone.role_key == rk,
            StaffRoleMilestone.cadence == "monthly",
            StaffRoleMilestone.period_start >= src_start,
            StaffRoleMilestone.period_start < src_end_ex,
        )
        .order_by(StaffRoleMilestone.id.asc())
        .all()
    )

    if not src:
        return {"ok": True, "created": 0, "skipped": 0, "source": 0, "target_period_start": dst_start.isoformat()}

    src_ids = [int(m.id) for m in src]
    done_counts: dict[int, int] = {}
    if src_ids:
        rows = (
            db.query(StaffMilestoneProgress.milestone_id, StaffMilestoneProgress.id)
            .filter(StaffMilestoneProgress.milestone_id.in_(src_ids), StaffMilestoneProgress.is_completed.is_(True))
            .all()
        )
        for mid, _pid in rows:
            done_counts[int(mid)] = int(done_counts.get(int(mid), 0)) + 1

    # existing milestones in target month to prevent duplicates (same title)
    existing_dst = (
        db.query(StaffRoleMilestone)
        .filter(
            StaffRoleMilestone.deleted_at.is_(None),
            StaffRoleMilestone.role_key == rk,
            StaffRoleMilestone.cadence == "monthly",
            StaffRoleMilestone.period_start >= dst_start,
            StaffRoleMilestone.period_start < _month_end_exclusive(dst_start),
        )
        .all()
    )
    existing_titles = {str(m.title or "").strip().lower() for m in existing_dst}

    created = 0
    skipped = 0
    for m in src:
        done = int(done_counts.get(int(m.id), 0))
        # "Incomplete" means not everyone in the role marked it complete.
        if done >= total_staff:
            skipped += 1
            continue
        key = str(m.title or "").strip().lower()
        if key in existing_titles:
            skipped += 1
            continue
        db.add(
            StaffRoleMilestone(
                role_key=rk,
                cadence="monthly",
                period_start=dst_start,
                period_end=None,
                title=str(m.title or "").strip()[:140],
                description=str(m.description or "").strip()[:800] if m.description else None,
                is_completed=False,
                created_by_staff_user_id=int(current_staff.id),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
        )
        existing_titles.add(key)
        created += 1

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.milestone.carry_over_monthly",
            entity="staff_role_milestones",
            entity_id=f"{rk}:{src_start.isoformat()}",
            details={"role_key": rk, "source_period_start": src_start.isoformat(), "target_period_start": dst_start.isoformat(), "created": created, "skipped": skipped},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True, "created": created, "skipped": skipped, "source": len(src), "target_period_start": dst_start.isoformat()}


@router.get("/milestones/month-summary")
def milestones_month_summary(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),  # noqa: ARG001
):
    start = date(int(year), int(month), 1)
    end_ex = _month_end_exclusive(start)

    milestones = (
        db.query(StaffRoleMilestone)
        .filter(
            StaffRoleMilestone.deleted_at.is_(None),
            StaffRoleMilestone.cadence == "monthly",
            StaffRoleMilestone.period_start >= start,
            StaffRoleMilestone.period_start < end_ex,
        )
        .all()
    )

    by_role: dict[str, list[StaffRoleMilestone]] = {}
    for m in milestones:
        by_role.setdefault(str(m.role_key), []).append(m)

    out_items: list[dict] = []
    for rk, ms in sorted(by_role.items(), key=lambda x: x[0]):
        staff_rows = db.execute(
            sa_text(
                """
                SELECT COUNT(*)
                FROM staff_users su
                JOIN staff_user_roles ur ON ur.user_id = su.id
                JOIN staff_roles r ON r.id = ur.role_id
                WHERE r.key = :rk
                  AND su.is_active = true
                  AND su.deleted_at IS NULL
                """
            ),
            {"rk": rk},
        ).fetchone()
        total_staff = int(staff_rows[0]) if staff_rows and staff_rows[0] is not None else 0
        done_total = sum(1 for m in ms if bool(m.is_completed))
        denom = max(1, len(ms))
        completion_rate = float(done_total) / float(denom) if denom else 0.0
        out_items.append(
            {
                "role_key": rk,
                "total_staff": total_staff,
                "milestones": len(ms),
                "done_total": done_total,
                "completion_rate": completion_rate,
            }
        )

    return {"year": int(year), "month": int(month), "items": out_items}


@router.post("/tasks/{task_id}/delete")
def delete_task(
    request: Request,
    task_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    row = (
        db.query(StaffAssignedTask)
        .filter(StaffAssignedTask.id == int(task_id), StaffAssignedTask.deleted_at.is_(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    row.deleted_at = datetime.utcnow()
    row.deleted_by_staff_user_id = int(current_staff.id)
    row.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.task.delete",
            entity="staff_assigned_tasks",
            entity_id=str(row.id),
            details={"staff_user_id": int(row.staff_user_id), "work_date": row.work_date.isoformat()},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}


@router.post("/tasks/{task_id}/update")
def update_task(
    request: Request,
    task_id: int,
    payload: TaskUpdatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    row = (
        db.query(StaffAssignedTask)
        .filter(StaffAssignedTask.id == int(task_id), StaffAssignedTask.deleted_at.is_(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    before = {"work_date": row.work_date.isoformat(), "text": row.text}
    row.text = payload.text.strip()[:4000]
    if payload.work_date is not None:
        row.work_date = payload.work_date
    row.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.task.update",
            entity="staff_assigned_tasks",
            entity_id=str(row.id),
            details={"before": before, "after": {"work_date": row.work_date.isoformat(), "text": row.text}},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}


@router.post("/milestones/{milestone_id}/delete")
def delete_milestone(
    request: Request,
    milestone_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("work_logs.manage")),
):
    row = (
        db.query(StaffRoleMilestone)
        .filter(StaffRoleMilestone.id == int(milestone_id), StaffRoleMilestone.deleted_at.is_(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    row.deleted_at = datetime.utcnow()
    row.deleted_by_staff_user_id = int(current_staff.id)
    row.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="work_plans.milestone.delete",
            entity="staff_role_milestones",
            entity_id=str(row.id),
            details={"role_key": row.role_key, "cadence": row.cadence, "period_start": row.period_start.isoformat()},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}
