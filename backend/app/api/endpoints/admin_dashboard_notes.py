from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_staff_user, require_staff_permission
from ...database import get_db
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_dashboard_note import StaffDashboardNote
from ...models.staff_role import StaffRole
from ...models.staff_user import StaffUser
from ...services.staff_rbac_service import StaffRBACService


router = APIRouter(prefix="/admin/dashboard-notes", tags=["admin-dashboard-notes"])


def _now() -> datetime:
    return datetime.utcnow()


def _iso_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    try:
        aware = dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
        return aware.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return dt.isoformat()


def _view(db: Session, row: StaffDashboardNote) -> dict:
    role_keys = []
    staff_ids = []
    if not row.target_all:
        role_keys = [
            str(r[0])
            for r in db.execute(
                text(
                    """
                    SELECT r.key
                    FROM staff_dashboard_note_target_roles tr
                    JOIN staff_roles r ON r.id = tr.role_id
                    WHERE tr.note_id = :nid
                    ORDER BY r.key
                    """
                ),
                {"nid": int(row.id)},
            ).fetchall()
            if r and r[0]
        ]
        staff_ids = [
            int(x[0])
            for x in db.execute(
                text(
                    """
                    SELECT staff_user_id
                    FROM staff_dashboard_note_target_users
                    WHERE note_id = :nid
                    ORDER BY staff_user_id
                    """
                ),
                {"nid": int(row.id)},
            ).fetchall()
            if x and x[0] is not None
        ]

    return {
        "id": row.id,
        "title": row.title,
        "body": row.body,
        "meeting_url": row.meeting_url,
        "visible_from": _iso_utc(row.visible_from),
        "visible_until": _iso_utc(row.visible_until),
        "status": row.status,
        "target_all": bool(row.target_all),
        "target_role_keys": role_keys,
        "target_staff_user_ids": staff_ids,
        "is_deleted": bool(row.is_deleted),
        "deleted_at": _iso_utc(row.deleted_at),
        "deleted_by_staff_user_id": row.deleted_by_staff_user_id,
        "created_by_staff_user_id": row.created_by_staff_user_id,
        "updated_by_staff_user_id": row.updated_by_staff_user_id,
        "created_at": _iso_utc(row.created_at),
        "updated_at": _iso_utc(row.updated_at),
    }


class NoteCreatePayload(BaseModel):
    title: str = Field(..., min_length=2, max_length=160)
    body: str = Field(..., min_length=2, max_length=8000)
    meeting_url: HttpUrl | None = None
    visible_from: datetime | None = None
    visible_until: datetime | None = None
    target_all: bool = True
    target_role_keys: list[str] = Field(default_factory=list, max_length=20)
    target_staff_user_ids: list[int] = Field(default_factory=list, max_length=200)


class NoteUpdatePayload(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=160)
    body: str | None = Field(None, min_length=2, max_length=8000)
    meeting_url: HttpUrl | None = None
    visible_from: datetime | None = None
    visible_until: datetime | None = None
    target_all: bool | None = None
    target_role_keys: list[str] | None = None
    target_staff_user_ids: list[int] | None = None


@router.get("/active")
def list_active_notes(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),
):
    now = _now()
    roles = StaffRBACService.get_user_role_keys(db, int(current_staff.id))

    # Fetch candidates by window/status first.
    # Notes are only visible to staff during the configured time window:
    # - visible_from: when it should start showing (optional)
    # - visible_until: when it should stop showing (optional)
    q = (
        db.query(StaffDashboardNote)
        .filter(StaffDashboardNote.is_deleted.is_(False))
        .filter(StaffDashboardNote.status == "published")
        .filter((StaffDashboardNote.visible_from.is_(None)) | (StaffDashboardNote.visible_from <= now))
        .filter((StaffDashboardNote.visible_until.is_(None)) | (StaffDashboardNote.visible_until >= now))
        .order_by(StaffDashboardNote.visible_from.desc().nullslast(), StaffDashboardNote.id.desc())
    )

    rows = q.limit(10).all()
    if not rows:
        return {"items": []}

    role_ids = []
    if roles:
        role_ids = [
            int(r[0])
            for r in db.query(StaffRole.id).filter(StaffRole.key.in_([str(x).lower() for x in roles])).all()
            if r and r[0] is not None
        ]

    out = []
    for row in rows:
        if row.target_all:
            out.append(_view(db, row))
            continue

        ok = False
        # direct user targeting
        x = db.execute(
            text(
                "SELECT 1 FROM staff_dashboard_note_target_users WHERE note_id=:nid AND staff_user_id=:uid LIMIT 1"
            ),
            {"nid": int(row.id), "uid": int(current_staff.id)},
        ).fetchone()
        if x:
            ok = True
        elif role_ids:
            y = db.execute(
                text(
                    "SELECT 1 FROM staff_dashboard_note_target_roles WHERE note_id=:nid AND role_id = ANY(:rids) LIMIT 1"
                ),
                {"nid": int(row.id), "rids": role_ids},
            ).fetchone()
            if y:
                ok = True

        if ok:
            out.append(_view(db, row))

    return {"items": out}


@router.get("")
def list_notes(
    include_deleted: int = 0,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("dashboard_notes.manage")),
):
    limit_value = max(1, min(200, int(limit)))
    offset_value = max(0, int(offset))

    q = db.query(StaffDashboardNote)
    if not include_deleted:
        q = q.filter(StaffDashboardNote.is_deleted.is_(False))

    total = q.count()
    rows = (
        q.order_by(StaffDashboardNote.created_at.desc(), StaffDashboardNote.id.desc())
        .offset(offset_value)
        .limit(limit_value)
        .all()
    )
    return {"total": int(total), "limit": int(limit_value), "offset": int(offset_value), "items": [_view(db, r) for r in rows]}


@router.get("/picklists")
def picklists(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("dashboard_notes.manage")),  # noqa: ARG001
):
    roles = db.execute(text("SELECT key, name FROM staff_roles ORDER BY name")).fetchall()
    staff_rows = db.execute(
        text(
            """
            SELECT u.id, u.email, u.full_name, u.employee_code
            FROM staff_users u
            WHERE u.deleted_at IS NULL AND u.is_active = true
            ORDER BY COALESCE(u.full_name, u.email) ASC, u.id ASC
            LIMIT 500
            """
        )
    ).fetchall()

    # Attach roles to staff for display (non-sensitive).
    staff_items = []
    for r in staff_rows:
        uid = int(r[0])
        staff_items.append(
            {
                "id": uid,
                "email": str(r[1] or ""),
                "full_name": str(r[2] or ""),
                "employee_code": str(r[3] or ""),
                "roles": StaffRBACService.get_user_role_keys(db, uid),
            }
        )

    return {
        "roles": [{"key": str(x[0]), "name": str(x[1])} for x in roles if x and x[0] and x[1]],
        "staff": staff_items,
    }


@router.post("", status_code=201)
def create_note(
    request: Request,
    payload: NoteCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("dashboard_notes.manage")),
):
    vf = payload.visible_from
    vu = payload.visible_until
    if vf and vu and vf > vu:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Visible window is invalid")

    row = StaffDashboardNote(
        title=payload.title.strip()[:160],
        body=payload.body.strip()[:8000],
        meeting_url=str(payload.meeting_url) if payload.meeting_url else None,
        visible_from=vf,
        visible_until=vu,
        status="draft",
        target_all=bool(payload.target_all),
        created_by_staff_user_id=int(current_staff.id),
        updated_by_staff_user_id=int(current_staff.id),
        is_deleted=False,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(row)
    db.flush()

    if not row.target_all:
        # Roles
        keys = [str(k).strip().lower() for k in (payload.target_role_keys or []) if str(k).strip()]
        if keys:
            role_ids = [int(r[0]) for r in db.execute(text("SELECT id FROM staff_roles WHERE key = ANY(:keys)"), {"keys": keys}).fetchall()]
            for rid in role_ids:
                db.execute(
                    text("INSERT INTO staff_dashboard_note_target_roles (note_id, role_id) VALUES (:nid,:rid) ON CONFLICT DO NOTHING"),
                    {"nid": int(row.id), "rid": int(rid)},
                )

        # Users
        for uid in [int(x) for x in (payload.target_staff_user_ids or []) if int(x) > 0]:
            db.execute(
                text(
                    "INSERT INTO staff_dashboard_note_target_users (note_id, staff_user_id) VALUES (:nid,:uid) ON CONFLICT DO NOTHING"
                ),
                {"nid": int(row.id), "uid": int(uid)},
            )

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="dashboard_notes.create",
            entity="staff_dashboard_notes",
            entity_id=str(row.id),
            details={"title": row.title, "status": row.status},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=_now(),
        )
    )
    db.commit()
    db.refresh(row)
    return {"ok": True, "item": _view(db, row)}


@router.patch("/{note_id}")
def update_note(
    request: Request,
    note_id: int,
    payload: NoteUpdatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("dashboard_notes.manage")),
):
    row = db.query(StaffDashboardNote).filter(StaffDashboardNote.id == int(note_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if row.is_deleted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This note is deleted")

    before = {
        "title": row.title,
        "body": row.body,
        "meeting_url": row.meeting_url,
        "visible_from": _iso_utc(row.visible_from),
        "visible_until": _iso_utc(row.visible_until),
        "target_all": bool(row.target_all),
    }

    fields = getattr(payload, "model_fields_set", set()) or set()

    if payload.title is not None:
        row.title = payload.title.strip()[:160]
    if payload.body is not None:
        row.body = payload.body.strip()[:8000]
    if "meeting_url" in fields:
        row.meeting_url = str(payload.meeting_url) if payload.meeting_url else None
    if "visible_from" in fields:
        row.visible_from = payload.visible_from
    if "visible_until" in fields:
        row.visible_until = payload.visible_until
    if row.visible_from and row.visible_until and row.visible_from > row.visible_until:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Visible window is invalid")

    if "target_all" in fields and payload.target_all is not None:
        row.target_all = bool(payload.target_all)

    row.updated_by_staff_user_id = int(current_staff.id)
    row.updated_at = _now()

    # Replace targeting (idempotent).
    if "target_role_keys" in fields or "target_staff_user_ids" in fields or "target_all" in fields:
        db.execute(text("DELETE FROM staff_dashboard_note_target_roles WHERE note_id=:nid"), {"nid": int(row.id)})
        db.execute(text("DELETE FROM staff_dashboard_note_target_users WHERE note_id=:nid"), {"nid": int(row.id)})

        if not row.target_all:
            keys = [str(k).strip().lower() for k in (payload.target_role_keys or []) if str(k).strip()]
            if keys:
                role_ids = [int(r[0]) for r in db.execute(text("SELECT id FROM staff_roles WHERE key = ANY(:keys)"), {"keys": keys}).fetchall()]
                for rid in role_ids:
                    db.execute(
                        text(
                            "INSERT INTO staff_dashboard_note_target_roles (note_id, role_id) VALUES (:nid,:rid) ON CONFLICT DO NOTHING"
                        ),
                        {"nid": int(row.id), "rid": int(rid)},
                    )

            for uid in [int(x) for x in (payload.target_staff_user_ids or []) if int(x) > 0]:
                db.execute(
                    text(
                        "INSERT INTO staff_dashboard_note_target_users (note_id, staff_user_id) VALUES (:nid,:uid) ON CONFLICT DO NOTHING"
                    ),
                    {"nid": int(row.id), "uid": int(uid)},
                )

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="dashboard_notes.edit",
            entity="staff_dashboard_notes",
            entity_id=str(row.id),
            details={"before": before, "after": {"title": row.title, "status": row.status}},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=_now(),
        )
    )
    db.commit()
    db.refresh(row)
    return {"ok": True, "item": _view(db, row)}


@router.post("/{note_id}/publish")
def publish_note(
    request: Request,
    note_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("dashboard_notes.manage")),
):
    row = db.query(StaffDashboardNote).filter(StaffDashboardNote.id == int(note_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if row.is_deleted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This note is deleted")

    # If window isn't set, make it visible immediately with no expiry.
    if row.visible_from is None:
        row.visible_from = _now()

    row.status = "published"
    row.updated_by_staff_user_id = int(current_staff.id)
    row.updated_at = _now()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="dashboard_notes.publish",
            entity="staff_dashboard_notes",
            entity_id=str(row.id),
            details={"title": row.title},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=_now(),
        )
    )
    db.commit()
    db.refresh(row)
    return {"ok": True, "item": _view(db, row)}


@router.post("/{note_id}/draft")
def unpublish_note(
    request: Request,
    note_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("dashboard_notes.manage")),
):
    row = db.query(StaffDashboardNote).filter(StaffDashboardNote.id == int(note_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if row.is_deleted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This note is deleted")

    row.status = "draft"
    row.updated_by_staff_user_id = int(current_staff.id)
    row.updated_at = _now()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="dashboard_notes.draft",
            entity="staff_dashboard_notes",
            entity_id=str(row.id),
            details={"title": row.title},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=_now(),
        )
    )
    db.commit()
    db.refresh(row)
    return {"ok": True, "item": _view(db, row)}


@router.delete("/{note_id}")
def soft_delete_note(
    request: Request,
    note_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("dashboard_notes.manage")),
):
    row = db.query(StaffDashboardNote).filter(StaffDashboardNote.id == int(note_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if row.is_deleted:
        return {"ok": True}

    row.is_deleted = True
    row.deleted_at = _now()
    row.deleted_by_staff_user_id = int(current_staff.id)
    row.updated_by_staff_user_id = int(current_staff.id)
    row.updated_at = _now()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="dashboard_notes.soft_delete",
            entity="staff_dashboard_notes",
            entity_id=str(row.id),
            details={"title": row.title},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=_now(),
        )
    )
    db.commit()
    return {"ok": True}
