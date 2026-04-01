from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_intranet_update import StaffIntranetUpdate
from ...models.staff_user import StaffUser
from ...services.staff_rbac_service import StaffRBACService


router = APIRouter(prefix="/admin/intranet-updates", tags=["admin-intranet-updates"])


def _is_admin(db: Session, staff: StaffUser) -> bool:
    perms = StaffRBACService.get_user_permission_keys(db, staff.id)
    return StaffRBACService.has_permission(perms, "*") or StaffRBACService.has_permission(perms, "admin.manage")


def _iso_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    try:
        aware = dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
        return aware.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return dt.isoformat()


class UpdateCreatePayload(BaseModel):
    title: str = Field(..., min_length=2, max_length=160)
    body: str = Field(..., min_length=2, max_length=8000)


class UpdateUpdatePayload(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=160)
    body: str | None = Field(None, min_length=2, max_length=8000)


def _view(row: StaffIntranetUpdate) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "body": row.body,
        "created_by_staff_user_id": row.created_by_staff_user_id,
        "updated_by_staff_user_id": row.updated_by_staff_user_id,
        "is_deleted": bool(row.is_deleted),
        "deleted_at": _iso_utc(row.deleted_at),
        "deleted_by_staff_user_id": row.deleted_by_staff_user_id,
        "created_at": _iso_utc(row.created_at),
        "updated_at": _iso_utc(row.updated_at),
    }


@router.get("")
def list_updates(
    include_deleted: int = 0,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("intranet_updates.read")),
):
    limit_value = max(1, min(200, int(limit)))
    offset_value = max(0, int(offset))

    q = db.query(StaffIntranetUpdate)
    if include_deleted:
        if not _is_admin(db, current_staff) and not StaffRBACService.has_permission(
            StaffRBACService.get_user_permission_keys(db, current_staff.id), "intranet_updates.delete"
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    else:
        q = q.filter(StaffIntranetUpdate.is_deleted.is_(False))

    total = q.count()
    rows = (
        q.order_by(StaffIntranetUpdate.created_at.desc(), StaffIntranetUpdate.id.desc())
        .offset(offset_value)
        .limit(limit_value)
        .all()
    )
    return {"total": int(total), "limit": int(limit_value), "offset": int(offset_value), "items": [_view(r) for r in rows]}


@router.post("", status_code=201)
def create_update(
    request: Request,
    payload: UpdateCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("intranet_updates.write")),
):
    row = StaffIntranetUpdate(
        title=payload.title.strip()[:160],
        body=payload.body.strip()[:8000],
        created_by_staff_user_id=int(current_staff.id),
        updated_by_staff_user_id=int(current_staff.id),
        is_deleted=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="intranet_updates.create",
            entity="staff_intranet_updates",
            entity_id=str(row.id),
            details={"title": row.title},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(row)
    return {"ok": True, "item": _view(row)}


@router.patch("/{update_id}")
def update_update(
    request: Request,
    update_id: int,
    payload: UpdateUpdatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("intranet_updates.write")),
):
    row = db.query(StaffIntranetUpdate).filter(StaffIntranetUpdate.id == int(update_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if row.is_deleted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This update is deleted")

    before = {"title": row.title, "body": row.body}
    if payload.title is not None:
        row.title = payload.title.strip()[:160]
    if payload.body is not None:
        row.body = payload.body.strip()[:8000]
    row.updated_by_staff_user_id = int(current_staff.id)
    row.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="intranet_updates.edit",
            entity="staff_intranet_updates",
            entity_id=str(row.id),
            details={"before": before, "after": {"title": row.title, "body": row.body}},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(row)
    return {"ok": True, "item": _view(row)}


@router.delete("/{update_id}")
def soft_delete_update(
    request: Request,
    update_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("intranet_updates.delete")),
):
    row = db.query(StaffIntranetUpdate).filter(StaffIntranetUpdate.id == int(update_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if row.is_deleted:
        return {"ok": True}

    row.is_deleted = True
    row.deleted_at = datetime.utcnow()
    row.deleted_by_staff_user_id = int(current_staff.id)
    row.updated_by_staff_user_id = int(current_staff.id)
    row.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="intranet_updates.soft_delete",
            entity="staff_intranet_updates",
            entity_id=str(row.id),
            details={"title": row.title, "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}


@router.delete("/{update_id}/purge")
def purge_update(
    request: Request,
    update_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("admin.manage")),
):
    row = db.query(StaffIntranetUpdate).filter(StaffIntranetUpdate.id == int(update_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    title = row.title
    db.delete(row)
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="intranet_updates.purge",
            entity="staff_intranet_updates",
            entity_id=str(update_id),
            details={"title": title},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}
