from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_notification import StaffNotification
from ...models.staff_ticket import StaffTicket, StaffTicketMessage
from ...models.staff_user import StaffUser
from ...services.email_service import send_staff_ticket_notification
from ...services.staff_rbac_service import StaffRBACService


router = APIRouter(prefix="/admin/help", tags=["admin-help"])


ALLOWED_STATUSES = {"open", "in_progress", "waiting", "closed"}
ALLOWED_PRIORITIES = {"low", "normal", "high", "urgent"}


def _now() -> datetime:
    return datetime.utcnow()


def _safe_text(value: str | None, *, max_len: int) -> str:
    return str(value or "").strip()[:max_len]


def _get_permissions(request: Request, db: Session, current_staff: StaffUser) -> list[str]:
    perms = getattr(request.state, "staff_permissions", None)
    if perms is None:
        perms = StaffRBACService.get_user_permission_keys(db, current_staff.id)
        try:
            request.state.staff_permissions = perms
        except Exception:
            pass
    return perms


def _has(perms: list[str], key: str) -> bool:
    return StaffRBACService.has_permission(perms, key) or StaffRBACService.has_permission(perms, "*")


def _priority_sla_minutes(priority: str, details: dict | None) -> tuple[int, int]:
    # Allow per-ticket override in details.sla to avoid hardcoding in the long run.
    if isinstance(details, dict):
        sla = details.get("sla")
        if isinstance(sla, dict):
            fr = sla.get("first_response_minutes")
            rs = sla.get("resolve_minutes")
            try:
                fr_i = int(fr)
                rs_i = int(rs)
                if fr_i > 0 and rs_i > 0:
                    return fr_i, rs_i
            except Exception:
                pass

    # Defaults by priority (reasonable MVP).
    p = (priority or "normal").strip().lower()
    if p == "urgent":
        return 60, 8 * 60
    if p == "high":
        return 4 * 60, 24 * 60
    if p == "low":
        return 24 * 60, 7 * 24 * 60
    return 8 * 60, 48 * 60


def _ticket_sla_view(ticket: StaffTicket) -> dict:
    created_at = ticket.created_at or _now()
    first_minutes, resolve_minutes = _priority_sla_minutes(ticket.priority, ticket.details if isinstance(ticket.details, dict) else None)
    first_due = created_at + timedelta(minutes=int(first_minutes))
    resolve_due = created_at + timedelta(minutes=int(resolve_minutes))

    now = _now()
    first_breached = bool(ticket.first_response_at is None and now > first_due)
    resolve_breached = bool(ticket.status != "closed" and now > resolve_due)
    return {
        "first_response_due_at": first_due.isoformat(),
        "resolve_due_at": resolve_due.isoformat(),
        "first_response_breached": first_breached,
        "resolve_breached": resolve_breached,
    }


def _notify(db: Session, *, staff_user_id: int, type_: str, title: str, body: str | None, data: dict | None) -> None:
    db.add(
        StaffNotification(
            staff_user_id=int(staff_user_id),
            type=_safe_text(type_, max_len=48) or "event",
            title=_safe_text(title, max_len=140) or "Notification",
            body=_safe_text(body, max_len=500) if body else None,
            data=data,
            read_at=None,
            created_at=_now(),
        )
    )


def _manager_staff_ids(db: Session) -> list[int]:
    # All staff users that have tickets.manage (or *).
    rows = db.execute(
        text(
            """
            SELECT DISTINCT u.id
            FROM staff_users u
            JOIN staff_user_roles ur ON ur.user_id = u.id
            JOIN staff_role_permissions rp ON rp.role_id = ur.role_id
            JOIN staff_permissions p ON p.id = rp.permission_id
            WHERE u.is_active = true
              AND (p.key = 'tickets.manage' OR p.key = '*')
              AND COALESCE(u.deleted_at, NULL) IS NULL
            """
        )
    ).fetchall()
    return [int(r[0]) for r in rows if r and r[0] is not None]


class TicketCreatePayload(BaseModel):
    subject: str = Field(..., min_length=3, max_length=140)
    message: str = Field(..., min_length=3, max_length=2000)
    priority: str | None = Field(None, max_length=20)


class TicketMessagePayload(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class TicketAssignPayload(BaseModel):
    staff_user_id: int | None = None


class TicketPriorityPayload(BaseModel):
    priority: str = Field(..., min_length=2, max_length=20)


class TicketStatusPayload(BaseModel):
    status: str = Field(..., min_length=2, max_length=30)


@router.get("/notifications")
def list_notifications(
    unread_only: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    q = db.query(StaffNotification).filter(StaffNotification.staff_user_id == int(current_staff.id))
    if unread_only:
        q = q.filter(StaffNotification.read_at.is_(None))
    q = q.order_by(StaffNotification.created_at.desc())
    rows = q.limit(max(1, min(200, int(limit)))).all()
    return {
        "items": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "body": n.body,
                "data": n.data,
                "read_at": n.read_at.isoformat() if n.read_at else None,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in rows
        ]
    }


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    n = (
        db.query(StaffNotification)
        .filter(StaffNotification.id == int(notification_id), StaffNotification.staff_user_id == int(current_staff.id))
        .first()
    )
    if not n:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if n.read_at:
        return {"ok": True}
    n.read_at = _now()
    db.commit()
    return {"ok": True}


@router.get("/tickets")
def list_tickets(
    request: Request,
    status_filter: str | None = None,
    priority: str | None = None,
    assigned_to: int | None = None,
    mine: int = 0,
    q: str | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("tickets.read")),
):
    perms = _get_permissions(request, db, current_staff)
    is_manager = _has(perms, "tickets.manage")

    query = db.query(StaffTicket)
    if status_filter and status_filter in ALLOWED_STATUSES:
        query = query.filter(StaffTicket.status == status_filter)
    if priority:
        p = str(priority).strip().lower()
        if p in ALLOWED_PRIORITIES:
            query = query.filter(StaffTicket.priority == p)
    if assigned_to is not None:
        query = query.filter(StaffTicket.assigned_to_staff_user_id == int(assigned_to))
    if mine:
        query = query.filter(
            or_(
                StaffTicket.created_by_staff_user_id == int(current_staff.id),
                StaffTicket.assigned_to_staff_user_id == int(current_staff.id),
            )
        )
    if q:
        needle = str(q).strip()
        if needle:
            like = f"%{needle}%"
            query = query.filter(StaffTicket.subject.ilike(like))

    query = query.order_by(StaffTicket.updated_at.desc())
    tickets = query.limit(200).all()

    out: list[dict] = []
    for t in tickets:
        sla = _ticket_sla_view(t) if is_manager else None
        out.append(
            {
                "id": t.id,
                "subject": t.subject,
                "status": t.status,
                "priority": t.priority,
                "created_by_staff_user_id": t.created_by_staff_user_id,
                "assigned_to_staff_user_id": t.assigned_to_staff_user_id,
                "first_response_at": t.first_response_at.isoformat() if t.first_response_at else None,
                "last_message_at": t.last_message_at.isoformat() if t.last_message_at else None,
                "closed_at": t.closed_at.isoformat() if t.closed_at else None,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
                "sla": sla,
            }
        )
    return {
        "items": out,
        "me": {"id": current_staff.id, "email": current_staff.email},
        "capabilities": {"tickets_manage": bool(is_manager)},
    }


@router.get("/tickets/{ticket_id}")
def get_ticket(
    request: Request,
    ticket_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("tickets.read")),
):
    perms = _get_permissions(request, db, current_staff)
    is_manager = _has(perms, "tickets.manage")

    t = db.query(StaffTicket).filter(StaffTicket.id == int(ticket_id)).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    # Basic restriction: non-managers can view tickets they created or that are assigned to them.
    if not is_manager and int(t.created_by_staff_user_id) != int(current_staff.id) and int(t.assigned_to_staff_user_id or 0) != int(current_staff.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    msgs = (
        db.query(StaffTicketMessage)
        .filter(StaffTicketMessage.ticket_id == t.id)
        .order_by(StaffTicketMessage.created_at.asc())
        .all()
    )
    return {
        "ticket": {
            "id": t.id,
            "subject": t.subject,
            "status": t.status,
            "priority": t.priority,
            "created_by_staff_user_id": t.created_by_staff_user_id,
            "assigned_to_staff_user_id": t.assigned_to_staff_user_id,
            "first_response_at": t.first_response_at.isoformat() if t.first_response_at else None,
            "last_message_at": t.last_message_at.isoformat() if t.last_message_at else None,
            "closed_at": t.closed_at.isoformat() if t.closed_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "sla": _ticket_sla_view(t) if is_manager else None,
        },
        "messages": [
            {
                "id": m.id,
                "author_staff_user_id": m.author_staff_user_id,
                "message": m.message,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in msgs
        ],
    }


@router.post("/tickets")
def create_ticket(
    request: Request,
    payload: TicketCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("tickets.write")),
):
    p = (payload.priority or "normal").strip().lower()
    if p not in ALLOWED_PRIORITIES:
        p = "normal"

    t = StaffTicket(
        created_by_staff_user_id=int(current_staff.id),
        assigned_to_staff_user_id=None,
        status="open",
        priority=p,
        subject=_safe_text(payload.subject, max_len=140),
        details=None,
        first_response_at=None,
        last_message_at=None,
        closed_at=None,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(t)
    db.flush()
    msg = StaffTicketMessage(
        ticket_id=int(t.id),
        author_staff_user_id=int(current_staff.id),
        message=_safe_text(payload.message, max_len=2000),
        created_at=_now(),
    )
    db.add(msg)
    t.last_message_at = msg.created_at

    # Notify managers (in-app).
    for sid in _manager_staff_ids(db):
        if int(sid) == int(current_staff.id):
            continue
        _notify(
            db,
            staff_user_id=int(sid),
            type_="ticket.created",
            title=f"New ticket #{t.id}",
            body=t.subject,
            data={"ticket_id": int(t.id)},
        )

    db.commit()
    return {"ok": True, "id": t.id}


@router.post("/tickets/{ticket_id}/assign")
def assign_ticket(
    request: Request,
    ticket_id: int,
    payload: TicketAssignPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("tickets.manage")),
):
    t = db.query(StaffTicket).filter(StaffTicket.id == int(ticket_id)).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if t.status == "closed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ticket is closed")

    assignee_id = int(payload.staff_user_id) if payload.staff_user_id is not None else None
    if assignee_id is not None:
        assignee = db.query(StaffUser).filter(StaffUser.id == assignee_id).first()
        if not assignee or not assignee.is_active or getattr(assignee, "deleted_at", None) is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found")

    t.assigned_to_staff_user_id = assignee_id
    t.updated_at = _now()

    if assignee_id is not None:
        _notify(
            db,
            staff_user_id=int(assignee_id),
            type_="ticket.assigned",
            title=f"Ticket #{t.id} assigned to you",
            body=t.subject,
            data={"ticket_id": int(t.id)},
        )
        try:
            assignee = db.query(StaffUser).filter(StaffUser.id == int(assignee_id)).first()
            if assignee and assignee.email:
                send_staff_ticket_notification(
                    to_email=str(assignee.email),
                    ticket_id=int(t.id),
                    ticket_subject=str(t.subject or ""),
                    title="Assigned to you",
                    message=None,
                )
        except Exception:
            # Best-effort only; never block the API.
            pass
    db.commit()
    return {"ok": True}


@router.post("/tickets/{ticket_id}/priority")
def set_priority(
    ticket_id: int,
    payload: TicketPriorityPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("tickets.manage")),  # noqa: ARG001
):
    p = payload.priority.strip().lower()
    if p not in ALLOWED_PRIORITIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid priority")
    t = db.query(StaffTicket).filter(StaffTicket.id == int(ticket_id)).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    t.priority = p
    t.updated_at = _now()
    db.commit()
    return {"ok": True}


@router.post("/tickets/{ticket_id}/status")
def set_status(
    ticket_id: int,
    payload: TicketStatusPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("tickets.manage")),  # noqa: ARG001
):
    s = payload.status.strip().lower()
    if s not in ALLOWED_STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")
    t = db.query(StaffTicket).filter(StaffTicket.id == int(ticket_id)).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    t.status = s
    if s == "closed":
        t.closed_at = _now()
    else:
        t.closed_at = None
    t.updated_at = _now()
    db.commit()
    return {"ok": True}


@router.post("/tickets/{ticket_id}/messages")
def add_message(
    request: Request,
    ticket_id: int,
    payload: TicketMessagePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("tickets.write")),
):
    perms = _get_permissions(request, db, current_staff)
    is_manager = _has(perms, "tickets.manage")

    t = db.query(StaffTicket).filter(StaffTicket.id == int(ticket_id)).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if t.status == "closed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ticket is closed")

    if not is_manager and int(t.created_by_staff_user_id) != int(current_staff.id) and int(t.assigned_to_staff_user_id or 0) != int(current_staff.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    msg = StaffTicketMessage(
        ticket_id=int(t.id),
        author_staff_user_id=int(current_staff.id),
        message=_safe_text(payload.message, max_len=2000),
        created_at=_now(),
    )
    db.add(msg)
    t.updated_at = _now()
    t.last_message_at = msg.created_at

    if int(current_staff.id) != int(t.created_by_staff_user_id) and not t.first_response_at:
        t.first_response_at = msg.created_at

    # Move status forward for activity.
    if t.status == "open":
        t.status = "in_progress"

    # Notify assignee / creator.
    notify_targets: set[int] = set()
    if t.assigned_to_staff_user_id:
        notify_targets.add(int(t.assigned_to_staff_user_id))
    notify_targets.add(int(t.created_by_staff_user_id))
    if int(current_staff.id) in notify_targets:
        notify_targets.remove(int(current_staff.id))

    for sid in notify_targets:
        _notify(
            db,
            staff_user_id=int(sid),
            type_="ticket.message",
            title=f"New message on ticket #{t.id}",
            body=t.subject,
            data={"ticket_id": int(t.id)},
        )
        try:
            target = db.query(StaffUser).filter(StaffUser.id == int(sid)).first()
            if target and target.email:
                send_staff_ticket_notification(
                    to_email=str(target.email),
                    ticket_id=int(t.id),
                    ticket_subject=str(t.subject or ""),
                    title="New message",
                    message=msg.message,
                )
        except Exception:
            pass

    db.commit()
    return {"ok": True}


@router.post("/tickets/{ticket_id}/close")
def close_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("tickets.manage")),  # noqa: ARG001
):
    t = db.query(StaffTicket).filter(StaffTicket.id == int(ticket_id)).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if t.status == "closed":
        return {"ok": True}
    t.status = "closed"
    t.closed_at = _now()
    t.updated_at = _now()
    db.commit()
    return {"ok": True}
