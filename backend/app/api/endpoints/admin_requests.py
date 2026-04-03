from __future__ import annotations

from datetime import date, datetime, timedelta

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, text as sa_text
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_notification import StaffNotification
from ...models.staff_request import StaffRequest
from ...models.staff_user import StaffUser
from ...services.email_service import send_staff_notification_email
from ...services.requests_file_storage_service import delete_requests_attachment, store_requests_attachment
from ...services.staff_rbac_service import StaffRBACService


router = APIRouter(prefix="/admin/requests", tags=["admin-requests"])


ALLOWED_TYPES = {"day_off", "annual_leave", "sick_leave", "training"}
ALLOWED_STATUSES = {"draft", "pending", "approved", "rejected"}


def _now() -> datetime:
    return datetime.utcnow()


def _safe_text(value: str | None, *, max_len: int) -> str:
    return str(value or "").strip()[:max_len]


def _staff_portal_url(request: Request) -> str:
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


def _requests_link(request: Request, request_id: int | None = None) -> str:
    base = _staff_portal_url(request).rstrip("/")
    if request_id:
        return f"{base}/requests?open={int(request_id)}"
    return f"{base}/requests"


def _aud(
    request: Request | None,
    db: Session,
    *,
    actor_id: int,
    action: str,
    entity: str | None,
    entity_id: str | None,
    details: dict | None,
) -> None:
    db.add(
        StaffAuditLog(
            actor_id=int(actor_id),
            action=_safe_text(action, max_len=80) or "event",
            entity=_safe_text(entity, max_len=80) if entity else None,
            entity_id=_safe_text(entity_id, max_len=80) if entity_id else None,
            details=details,
            ip=request.client.host if (request and request.client) else None,
            user_agent=(request.headers.get("user-agent") if request else None),
            created_at=_now(),
        )
    )


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


def _staff_ids_with_permission(db: Session, perm_key: str) -> list[int]:
    rows = db.execute(
        sa_text(
            """
            SELECT DISTINCT su.id
            FROM staff_users su
            JOIN staff_user_roles ur ON ur.user_id = su.id
            JOIN staff_role_permissions rp ON rp.role_id = ur.role_id
            JOIN staff_permissions p ON p.id = rp.permission_id
            WHERE p.key = :k
              AND su.is_active = true
              AND su.deleted_at IS NULL
            """
        ),
        {"k": str(perm_key)},
    ).fetchall()
    return [int(r[0]) for r in rows if r and r[0] is not None]


def _type_label(t: str) -> str:
    m = {
        "day_off": "Day off",
        "annual_leave": "Annual leave",
        "sick_leave": "Sick leave",
        "training": "Training",
    }
    return m.get(str(t or "").strip().lower(), str(t or "").strip())


def _contains_weekend(start: date, end: date) -> bool:
    d = start
    while d <= end:
        if int(d.weekday()) >= 5:
            return True
        d = d + timedelta(days=1)
    return False


def _overlaps_existing(db: Session, *, staff_user_id: int, start: date, end: date, exclude_id: int | None = None) -> bool:
    return _find_overlapping_request(db, staff_user_id=staff_user_id, start=start, end=end, exclude_id=exclude_id) is not None


def _find_overlapping_request(
    db: Session, *, staff_user_id: int, start: date, end: date, exclude_id: int | None = None
) -> StaffRequest | None:
    # Any overlap with pending/approved requests for same staff (excluding soft deleted).
    status_expr = func.lower(func.trim(StaffRequest.status))
    q = db.query(StaffRequest).filter(
        StaffRequest.deleted_at.is_(None),
        StaffRequest.staff_user_id == int(staff_user_id),
        status_expr.in_(["pending", "approved"]),
        or_(StaffRequest.end_date.is_(None), StaffRequest.end_date >= start),
        StaffRequest.start_date <= end,
    )
    if exclude_id is not None:
        q = q.filter(StaffRequest.id != int(exclude_id))
    return q.order_by(StaffRequest.start_date.asc(), StaffRequest.id.asc()).first()


def _overlap_detail_message(existing: StaffRequest) -> str:
    end = existing.end_date or existing.start_date
    status_lc = str(existing.status or "").strip().lower()
    status_label = status_lc if status_lc in {"pending", "approved"} else (existing.status or "pending")
    return (
        f"You already have a {status_label} {_type_label(existing.type)} request for "
        f"{existing.start_date.isoformat()} to {end.isoformat()}. Please choose different dates."
    )


class RequestCreatePayload(BaseModel):
    type: str = Field(..., min_length=2, max_length=40)
    start_date: date
    end_date: date | None = None
    details: str | None = Field(None, max_length=4000)


class RequestUpdatePayload(BaseModel):
    type: str = Field(..., min_length=2, max_length=40)
    start_date: date
    end_date: date | None = None
    details: str | None = Field(None, max_length=4000)


class RequestDecidePayload(BaseModel):
    status: str = Field(..., min_length=3, max_length=20)  # approved|rejected
    comment: str | None = Field(None, max_length=1000)


class ManagerCreatePayload(BaseModel):
    staff_user_id: int
    type: str = Field(..., min_length=2, max_length=40)
    start_date: date
    end_date: date | None = None
    details: str | None = Field(None, max_length=4000)
    status: str = Field("pending", min_length=3, max_length=20)  # draft|pending


class ManagerUpdatePayload(BaseModel):
    type: str = Field(..., min_length=2, max_length=40)
    start_date: date
    end_date: date | None = None
    details: str | None = Field(None, max_length=4000)


def _serialize(r: StaffRequest) -> dict:
    return {
        "id": r.id,
        "staff_user_id": r.staff_user_id,
        "type": r.type,
        "status": r.status,
        "start_date": r.start_date.isoformat() if r.start_date else None,
        "end_date": r.end_date.isoformat() if r.end_date else None,
        "details": r.details,
        "attachments": r.attachments if isinstance(r.attachments, list) else [],
        "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
        "decided_at": r.decided_at.isoformat() if r.decided_at else None,
        "decided_by_staff_user_id": r.decided_by_staff_user_id,
        "decision_comment": r.decision_comment,
        "deleted_at": r.deleted_at.isoformat() if r.deleted_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def _can_manage_requests(db: Session, current_staff: StaffUser) -> bool:
    perms = StaffRBACService.get_user_permission_keys(db, current_staff.id)
    return bool(StaffRBACService.has_permission(perms, "*") or StaffRBACService.has_permission(perms, "requests.manage"))


def _require_owner_or_manager(db: Session, *, current_staff: StaffUser, staff_user_id: int) -> None:
    if int(staff_user_id) == int(current_staff.id):
        return
    if _can_manage_requests(db, current_staff):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")


@router.get("/my")
def my_requests(
    include_deleted: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.read_own")),
):
    q = db.query(StaffRequest).filter(StaffRequest.staff_user_id == int(current_staff.id))
    if not include_deleted:
        q = q.filter(StaffRequest.deleted_at.is_(None))
    rows = q.order_by(StaffRequest.created_at.desc().nullslast(), StaffRequest.id.desc()).limit(400).all()
    return {"items": [_serialize(r) for r in rows]}


@router.get("/pending-count")
def pending_count(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.manage")),  # noqa: ARG001
):
    count = (
        db.query(StaffRequest.id)
        .filter(
            StaffRequest.deleted_at.is_(None),
            StaffRequest.status == "pending",
        )
        .count()
    )
    return {"count": int(count)}


@router.get("/export.csv")
def export_csv(
    status_filter: str | None = None,
    type_filter: str | None = None,
    staff_user_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
    include_deleted: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.manage")),  # noqa: ARG001
):
    q = db.query(StaffRequest, StaffUser).join(StaffUser, StaffUser.id == StaffRequest.staff_user_id)
    if not include_deleted:
        q = q.filter(StaffRequest.deleted_at.is_(None))

    # Same behavior as list_all: don't include drafts unless explicitly requested.
    status_expr = func.lower(func.trim(StaffRequest.status))

    if status_filter:
        s = str(status_filter).strip().lower()
        if s not in ALLOWED_STATUSES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status filter")
        q = q.filter(status_expr == s)
    else:
        q = q.filter(status_expr != "draft")
    if type_filter:
        t = str(type_filter).strip().lower()
        if t not in ALLOWED_TYPES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid type filter")
        q = q.filter(StaffRequest.type == t)
    if staff_user_id is not None:
        q = q.filter(StaffRequest.staff_user_id == int(staff_user_id))
    if start is not None:
        q = q.filter(StaffRequest.start_date >= start)
    if end is not None:
        q = q.filter(or_(StaffRequest.end_date.is_(None), StaffRequest.end_date <= end))

    rows = q.order_by(StaffRequest.created_at.desc().nullslast(), StaffRequest.id.desc()).limit(2000).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "id",
            "staff_user_id",
            "staff_email",
            "staff_name",
            "type",
            "status",
            "start_date",
            "end_date",
            "submitted_at",
            "decided_at",
            "decision_comment",
            "attachments",
            "deleted_at",
        ]
    )
    for r, u in rows:
        w.writerow(
            [
                int(r.id),
                int(r.staff_user_id),
                str(u.email or ""),
                str(getattr(u, "full_name", None) or ""),
                str(r.type or ""),
                str(r.status or ""),
                r.start_date.isoformat() if r.start_date else "",
                r.end_date.isoformat() if r.end_date else "",
                r.submitted_at.isoformat() if r.submitted_at else "",
                r.decided_at.isoformat() if r.decided_at else "",
                str(r.decision_comment or ""),
                len(r.attachments) if isinstance(r.attachments, list) else 0,
                r.deleted_at.isoformat() if r.deleted_at else "",
            ]
        )

    content = buf.getvalue().encode("utf-8")
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=\"requests.csv\""},
    )






@router.get("/{request_id}")
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.read_own")),
):
    r = db.query(StaffRequest).filter(StaffRequest.id == int(request_id)).first()
    if not r or r.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    _require_owner_or_manager(db, current_staff=current_staff, staff_user_id=int(r.staff_user_id))

    return {"item": _serialize(r)}


@router.post("")
def create_request(
    request: Request,
    payload: RequestCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.write_own")),
):
    t = str(payload.type or "").strip().lower()
    if t not in ALLOWED_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid request type")

    if payload.end_date and payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="End date cannot be before start date")

    end = payload.end_date or payload.start_date
    if _contains_weekend(payload.start_date, end):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Requests cannot include weekends (Sat/Sun).")

    r = StaffRequest(
        staff_user_id=int(current_staff.id),
        type=t,
        status="draft",
        start_date=payload.start_date,
        end_date=payload.end_date,
        details=_safe_text(payload.details, max_len=4000) if payload.details else None,
        attachments=[],
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(r)
    db.flush()

    _aud(
        request,
        db,
        actor_id=int(current_staff.id),
        action="requests.create",
        entity="staff_requests",
        entity_id=str(r.id),
        details={"type": r.type, "start_date": r.start_date.isoformat(), "end_date": r.end_date.isoformat() if r.end_date else None},
    )
    db.commit()
    return {"ok": True, "id": int(r.id)}


@router.post("/{request_id}/update")
def update_request(
    request: Request,
    request_id: int,
    payload: RequestUpdatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.write_own")),
):
    r = (
        db.query(StaffRequest)
        .filter(StaffRequest.id == int(request_id), StaffRequest.staff_user_id == int(current_staff.id), StaffRequest.deleted_at.is_(None))
        .first()
    )
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if str(r.status or "").lower() != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only drafts can be edited")

    t = str(payload.type or "").strip().lower()
    if t not in ALLOWED_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid request type")
    if payload.end_date and payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="End date cannot be before start date")

    end = payload.end_date or payload.start_date
    if _contains_weekend(payload.start_date, end):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Requests cannot include weekends (Sat/Sun).")

    before = {"type": r.type, "start_date": r.start_date.isoformat(), "end_date": r.end_date.isoformat() if r.end_date else None, "details": r.details}
    r.type = t
    r.start_date = payload.start_date
    r.end_date = payload.end_date
    r.details = _safe_text(payload.details, max_len=4000) if payload.details else None
    r.updated_at = _now()

    _aud(
        request,
        db,
        actor_id=int(current_staff.id),
        action="requests.update",
        entity="staff_requests",
        entity_id=str(r.id),
        details={"before": before, "after": {"type": r.type, "start_date": r.start_date.isoformat(), "end_date": r.end_date.isoformat() if r.end_date else None}},
    )
    db.commit()
    return {"ok": True}


@router.post("/{request_id}/delete")
def delete_request(
    request: Request,
    request_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.write_own")),
):
    r = db.query(StaffRequest).filter(StaffRequest.id == int(request_id), StaffRequest.deleted_at.is_(None)).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    is_manager = _can_manage_requests(db, current_staff)

    if not is_manager:
        if int(r.staff_user_id) != int(current_staff.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        if str(r.status or "").lower() != "draft":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only drafts can be deleted")

    r.deleted_at = _now()
    r.deleted_by_staff_user_id = int(current_staff.id)
    r.updated_at = _now()

    _aud(
        request,
        db,
        actor_id=int(current_staff.id),
        action="requests.delete",
        entity="staff_requests",
        entity_id=str(r.id),
        details={"staff_user_id": int(r.staff_user_id), "status": r.status},
    )

    # Notify staff if manager deletes their request.
    if is_manager and int(r.staff_user_id) != int(current_staff.id):
        title = "Request deleted"
        body = f"Your request ({_type_label(r.type)}) was deleted by HR/Admin."
        _notify(db, staff_user_id=int(r.staff_user_id), type_="request.deleted", title=title, body=body, data={"request_id": int(r.id)})
        try:
            target = db.query(StaffUser).filter(StaffUser.id == int(r.staff_user_id)).first()
            if target and target.email:
                send_staff_notification_email(to_email=str(target.email), title=title, body=body)
        except Exception:
            pass
    db.commit()
    return {"ok": True}


@router.post("/{request_id}/submit")
def submit_request(
    request: Request,
    request_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.write_own")),
):
    r = (
        db.query(StaffRequest)
        .filter(StaffRequest.id == int(request_id), StaffRequest.staff_user_id == int(current_staff.id), StaffRequest.deleted_at.is_(None))
        .first()
    )
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if str(r.status or "").lower() != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only drafts can be submitted")

    end = r.end_date or r.start_date
    if _contains_weekend(r.start_date, end):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Requests cannot include weekends (Sat/Sun).")
    existing = _find_overlapping_request(db, staff_user_id=int(r.staff_user_id), start=r.start_date, end=end, exclude_id=int(r.id))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_overlap_detail_message(existing))

    r.status = "pending"
    r.submitted_at = _now()
    r.updated_at = _now()

    _aud(
        request,
        db,
        actor_id=int(current_staff.id),
        action="requests.submit",
        entity="staff_requests",
        entity_id=str(r.id),
        details={"type": r.type, "start_date": r.start_date.isoformat(), "end_date": r.end_date.isoformat() if r.end_date else None},
    )

    # Notify managers (in-app + best-effort email).
    title = f"New request: {_type_label(r.type)}"
    body = f"From: {getattr(current_staff, 'full_name', None) or current_staff.email}\nDates: {r.start_date.isoformat()}{' to ' + r.end_date.isoformat() if r.end_date else ''}"
    link = _requests_link(request, int(r.id))
    manager_ids = _staff_ids_with_permission(db, "requests.manage")
    for sid in manager_ids:
        if int(sid) == int(current_staff.id):
            continue
        _notify(db, staff_user_id=int(sid), type_="request.submitted", title=title, body=body, data={"request_id": int(r.id), "link": link})
        try:
            target = db.query(StaffUser).filter(StaffUser.id == int(sid)).first()
            if target and target.email:
                send_staff_notification_email(to_email=str(target.email), title=title, body=f"{body}\n\nOpen: {link}")
        except Exception:
            pass

    db.commit()
    return {"ok": True}


# ---- Manager endpoints ----


@router.get("")
def list_all(
    status_filter: str | None = None,
    type_filter: str | None = None,
    staff_user_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
    include_deleted: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.manage")),  # noqa: ARG001
):
    q = db.query(StaffRequest)
    if not include_deleted:
        q = q.filter(StaffRequest.deleted_at.is_(None))

    # Staff drafts are private and should not show up in the manager view unless explicitly filtered.
    status_expr = func.lower(func.trim(StaffRequest.status))

    if status_filter:
        s = str(status_filter).strip().lower()
        if s not in ALLOWED_STATUSES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status filter")
        q = q.filter(status_expr == s)
    else:
        q = q.filter(status_expr != "draft")
    if type_filter:
        t = str(type_filter).strip().lower()
        if t not in ALLOWED_TYPES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid type filter")
        q = q.filter(StaffRequest.type == t)
    if staff_user_id is not None:
        q = q.filter(StaffRequest.staff_user_id == int(staff_user_id))
    if start is not None:
        q = q.filter(StaffRequest.start_date >= start)
    if end is not None:
        q = q.filter(or_(StaffRequest.end_date.is_(None), StaffRequest.end_date <= end))

    rows = q.order_by(StaffRequest.created_at.desc().nullslast(), StaffRequest.id.desc()).limit(800).all()
    return {"items": [_serialize(r) for r in rows]}


@router.post("/manage/create")
def manager_create(
    request: Request,
    payload: ManagerCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.manage")),
):
    t = str(payload.type or "").strip().lower()
    if t not in ALLOWED_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid request type")

    s = str(payload.status or "").strip().lower()
    if s not in {"draft", "pending"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Status must be draft or pending")

    if payload.end_date and payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="End date cannot be before start date")

    end = payload.end_date or payload.start_date
    if _contains_weekend(payload.start_date, end):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Requests cannot include weekends (Sat/Sun).")

    staff = db.query(StaffUser).filter(StaffUser.id == int(payload.staff_user_id), StaffUser.deleted_at.is_(None)).first()
    if not staff or not StaffRBACService.is_active_staff(staff):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")

    # Overlap checks (only relevant if pending).
    if s == "pending":
        existing = _find_overlapping_request(db, staff_user_id=int(staff.id), start=payload.start_date, end=end, exclude_id=None)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_overlap_detail_message(existing))

    r = StaffRequest(
        staff_user_id=int(staff.id),
        type=t,
        status=s,
        start_date=payload.start_date,
        end_date=payload.end_date,
        details=_safe_text(payload.details, max_len=4000) if payload.details else None,
        attachments=[],
        submitted_at=_now() if s == "pending" else None,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(r)
    db.flush()

    _aud(
        request,
        db,
        actor_id=int(current_staff.id),
        action="requests.manager_create",
        entity="staff_requests",
        entity_id=str(r.id),
        details={"staff_user_id": int(r.staff_user_id), "type": r.type, "status": r.status},
    )

    if s == "pending":
        title = f"Request submitted: {_type_label(r.type)}"
        body = f"Dates: {r.start_date.isoformat()}{' to ' + r.end_date.isoformat() if r.end_date else ''}"
        link = _requests_link(request, int(r.id))
        _notify(db, staff_user_id=int(r.staff_user_id), type_="request.submitted", title=title, body=body, data={"request_id": int(r.id), "link": link})

    db.commit()
    return {"ok": True, "id": int(r.id)}


@router.post("/{request_id}/manage/update")
def manager_update(
    request: Request,
    request_id: int,
    payload: ManagerUpdatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.manage")),
):
    r = db.query(StaffRequest).filter(StaffRequest.id == int(request_id), StaffRequest.deleted_at.is_(None)).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if str(r.status or "").lower() not in {"draft", "pending"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft/pending requests can be edited")

    t = str(payload.type or "").strip().lower()
    if t not in ALLOWED_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid request type")
    if payload.end_date and payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="End date cannot be before start date")

    end = payload.end_date or payload.start_date
    if _contains_weekend(payload.start_date, end):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Requests cannot include weekends (Sat/Sun).")

    if str(r.status or "").lower() == "pending":
        existing = _find_overlapping_request(db, staff_user_id=int(r.staff_user_id), start=payload.start_date, end=end, exclude_id=int(r.id))
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_overlap_detail_message(existing))

    before = {
        "type": r.type,
        "start_date": r.start_date.isoformat(),
        "end_date": r.end_date.isoformat() if r.end_date else None,
        "details": r.details,
    }

    r.type = t
    r.start_date = payload.start_date
    r.end_date = payload.end_date
    r.details = _safe_text(payload.details, max_len=4000) if payload.details else None
    r.updated_at = _now()

    _aud(
        request,
        db,
        actor_id=int(current_staff.id),
        action="requests.manager_update",
        entity="staff_requests",
        entity_id=str(r.id),
        details={"before": before, "after": {"type": r.type, "start_date": r.start_date.isoformat(), "end_date": r.end_date.isoformat() if r.end_date else None}},
    )

    # Notify staff if HR/Admin edits a pending request.
    if str(r.status or "").lower() == "pending":
        title = "Request updated"
        body = f"Your request ({_type_label(r.type)}) was updated by HR/Admin."
        _notify(db, staff_user_id=int(r.staff_user_id), type_="request.updated", title=title, body=body, data={"request_id": int(r.id)})
        try:
            target = db.query(StaffUser).filter(StaffUser.id == int(r.staff_user_id)).first()
            if target and target.email:
                send_staff_notification_email(to_email=str(target.email), title=title, body=body)
        except Exception:
            pass

    db.commit()
    return {"ok": True}


@router.post("/{request_id}/decide")
def decide(
    request: Request,
    request_id: int,
    payload: RequestDecidePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.manage")),
):
    r = db.query(StaffRequest).filter(StaffRequest.id == int(request_id), StaffRequest.deleted_at.is_(None)).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if str(r.status or "").lower() != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only pending requests can be decided")

    s = str(payload.status or "").strip().lower()
    if s not in {"approved", "rejected"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Status must be approved or rejected")

    r.status = s
    r.decided_at = _now()
    r.decided_by_staff_user_id = int(current_staff.id)
    r.decision_comment = _safe_text(payload.comment, max_len=1000) if payload.comment else None
    r.updated_at = _now()

    if s == "approved":
        end = r.end_date or r.start_date
        if _contains_weekend(r.start_date, end):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Requests cannot include weekends (Sat/Sun).")
        existing = _find_overlapping_request(db, staff_user_id=int(r.staff_user_id), start=r.start_date, end=end, exclude_id=int(r.id))
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot approve: " + _overlap_detail_message(existing))

    _aud(
        request,
        db,
        actor_id=int(current_staff.id),
        action="requests.decide",
        entity="staff_requests",
        entity_id=str(r.id),
        details={"status": r.status, "comment": r.decision_comment},
    )

    # Notify requester.
    title = f"Request {r.status}: {_type_label(r.type)}"
    body = f"Dates: {r.start_date.isoformat()}{' to ' + r.end_date.isoformat() if r.end_date else ''}"
    if r.decision_comment:
        body = f"{body}\n\nComment: {r.decision_comment}"
    link = _requests_link(request, int(r.id))
    _notify(db, staff_user_id=int(r.staff_user_id), type_="request.decided", title=title, body=body, data={"request_id": int(r.id), "link": link})
    try:
        target = db.query(StaffUser).filter(StaffUser.id == int(r.staff_user_id)).first()
        if target and target.email:
            send_staff_notification_email(to_email=str(target.email), title=title, body=f"{body}\n\nOpen: {link}")
    except Exception:
        pass

    db.commit()
    return {"ok": True}


@router.post("/{request_id}/restore")
def restore(
    request: Request,
    request_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.manage")),
):
    r = db.query(StaffRequest).filter(StaffRequest.id == int(request_id)).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if r.deleted_at is None:
        return {"ok": True}

    r.deleted_at = None
    r.deleted_by_staff_user_id = None
    r.updated_at = _now()

    _aud(
        request,
        db,
        actor_id=int(current_staff.id),
        action="requests.restore",
        entity="staff_requests",
        entity_id=str(r.id),
        details={"staff_user_id": int(r.staff_user_id)},
    )

    title = "Request restored"
    body = f"Your request ({_type_label(r.type)}) was restored by HR/Admin."
    _notify(db, staff_user_id=int(r.staff_user_id), type_="request.restored", title=title, body=body, data={"request_id": int(r.id)})
    try:
        target = db.query(StaffUser).filter(StaffUser.id == int(r.staff_user_id)).first()
        if target and target.email:
            send_staff_notification_email(to_email=str(target.email), title=title, body=body)
    except Exception:
        pass

    db.commit()
    return {"ok": True}


@router.post("/{request_id}/attachments")
def upload_attachment(
    request: Request,
    request_id: int,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.read_own")),
):
    r = db.query(StaffRequest).filter(StaffRequest.id == int(request_id), StaffRequest.deleted_at.is_(None)).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    perms = StaffRBACService.get_user_permission_keys(db, current_staff.id)
    is_manager = StaffRBACService.has_permission(perms, "*") or StaffRBACService.has_permission(perms, "requests.manage")
    is_owner = int(r.staff_user_id) == int(current_staff.id)

    if not (is_owner or is_manager):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    # Staff can only attach while draft; managers can attach while draft/pending.
    status_lc = str(r.status or "").lower()
    if is_owner and status_lc != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Attachments are only allowed on drafts")
    if is_manager and status_lc not in {"draft", "pending"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Attachments are only allowed on draft/pending")

    try:
        stored = store_requests_attachment(file)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e

    attachments = r.attachments if isinstance(r.attachments, list) else []
    attachments.append(
        {
            "filename": stored.filename,
            "original_name": stored.original_name,
            "url": stored.url,
            "content_type": stored.content_type,
            "size_bytes": stored.size_bytes,
            "storage_backend": stored.storage_backend,
            "remote_dir": stored.remote_dir,
            "uploaded_at": _now().isoformat(),
            "uploaded_by_staff_user_id": int(current_staff.id),
        }
    )
    r.attachments = attachments
    r.updated_at = _now()

    _aud(
        request,
        db,
        actor_id=int(current_staff.id),
        action="requests.attachment.add",
        entity="staff_requests",
        entity_id=str(r.id),
        details={"filename": stored.filename, "original_name": stored.original_name},
    )

    db.commit()
    return {"ok": True, "attachment": attachments[-1]}


@router.post("/{request_id}/attachments/{filename}/remove")
def remove_attachment(
    request: Request,
    request_id: int,
    filename: str,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.read_own")),
):
    r = db.query(StaffRequest).filter(StaffRequest.id == int(request_id), StaffRequest.deleted_at.is_(None)).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    perms = StaffRBACService.get_user_permission_keys(db, current_staff.id)
    is_manager = StaffRBACService.has_permission(perms, "*") or StaffRBACService.has_permission(perms, "requests.manage")
    is_owner = int(r.staff_user_id) == int(current_staff.id)

    if not (is_owner or is_manager):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    status_lc = str(r.status or "").lower()
    if is_owner and status_lc != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Attachments can only be removed on drafts")
    if is_manager and status_lc not in {"draft", "pending"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Attachments can only be removed on draft/pending")

    attachments = r.attachments if isinstance(r.attachments, list) else []
    target = None
    kept = []
    for a in attachments:
        if str(a.get("filename") or "") == str(filename):
            target = a
            continue
        kept.append(a)

    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    try:
        delete_requests_attachment(
            storage_backend=str(target.get("storage_backend") or ""),
            remote_dir=target.get("remote_dir"),
            filename=str(target.get("filename") or ""),
        )
    except Exception:
        pass

    r.attachments = kept
    r.updated_at = _now()

    _aud(
        request,
        db,
        actor_id=int(current_staff.id),
        action="requests.attachment.remove",
        entity="staff_requests",
        entity_id=str(r.id),
        details={"filename": str(filename)},
    )

    db.commit()
    return {"ok": True}


@router.get("/{request_id}/audit")
def audit_timeline(
    request_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("requests.read_own")),
):
    r = db.query(StaffRequest).filter(StaffRequest.id == int(request_id)).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    _require_owner_or_manager(db, current_staff=current_staff, staff_user_id=int(r.staff_user_id))

    rows = (
        db.query(StaffAuditLog, StaffUser)
        .join(StaffUser, StaffUser.id == StaffAuditLog.actor_id)
        .filter(
            StaffAuditLog.entity == "staff_requests",
            StaffAuditLog.entity_id == str(int(request_id)),
            StaffAuditLog.action.like("requests.%"),
        )
        .order_by(StaffAuditLog.created_at.asc().nullslast(), StaffAuditLog.id.asc())
        .limit(200)
        .all()
    )

    def _actor_label(u: StaffUser) -> str:
        name = (getattr(u, "full_name", None) or "").strip()
        return f"{name} ({u.email})" if name else str(u.email)

    return {
        "items": [
            {
                "id": int(a.id),
                "action": a.action,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "actor": {"id": int(u.id), "label": _actor_label(u)},
                "details": a.details,
            }
            for a, u in rows
        ]
    }
