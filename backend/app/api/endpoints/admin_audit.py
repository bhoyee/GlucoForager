from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_user import StaffUser


router = APIRouter(prefix="/admin/audit", tags=["admin-audit"])


@router.get("")
def list_audit(
    limit: int = 100,
    offset: int = 0,
    actor_id: int | None = None,
    action: str | None = None,
    entity: str | None = None,
    entity_id: str | None = None,
    q: str | None = None,
    since: str | None = None,
    until: str | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("admin.manage")),  # noqa: ARG001
):
    limit_value = max(1, min(300, int(limit)))
    offset_value = max(0, int(offset))

    query = db.query(StaffAuditLog)
    if actor_id is not None:
        query = query.filter(StaffAuditLog.actor_id == int(actor_id))
    if action:
        query = query.filter(StaffAuditLog.action == str(action).strip())
    if entity:
        query = query.filter(StaffAuditLog.entity == str(entity).strip())
    if entity_id:
        query = query.filter(StaffAuditLog.entity_id == str(entity_id).strip())

    if q:
        term = str(q).strip()
        if term:
            like = f"%{term}%"
            query = query.filter(
                (StaffAuditLog.action.ilike(like))
                | (StaffAuditLog.entity.ilike(like))
                | (StaffAuditLog.entity_id.ilike(like))
            )

    if since:
        try:
            since_dt = datetime.fromisoformat(str(since).replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid since datetime")
        if since_dt.tzinfo is not None:
            since_dt = since_dt.astimezone(timezone.utc).replace(tzinfo=None)
        query = query.filter(StaffAuditLog.created_at >= since_dt)
    if until:
        try:
            until_dt = datetime.fromisoformat(str(until).replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid until datetime")
        if until_dt.tzinfo is not None:
            until_dt = until_dt.astimezone(timezone.utc).replace(tzinfo=None)
        query = query.filter(StaffAuditLog.created_at <= until_dt)

    total = query.count()
    rows = (
        query.order_by(StaffAuditLog.created_at.desc(), StaffAuditLog.id.desc())
        .offset(offset_value)
        .limit(limit_value)
        .all()
    )

    actor_ids = sorted({int(r.actor_id) for r in rows if r.actor_id is not None})
    email_by_id: dict[int, str] = {}
    if actor_ids:
        staff_rows = db.query(StaffUser.id, StaffUser.email).filter(StaffUser.id.in_(actor_ids)).all()
        for sid, email in staff_rows:
            if sid is None:
                continue
            email_by_id[int(sid)] = str(email or "")

    return {
        "total": int(total),
        "limit": int(limit_value),
        "offset": int(offset_value),
        "items": [
            {
                "id": r.id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "actor_id": r.actor_id,
                "actor_email": email_by_id.get(int(r.actor_id)) if r.actor_id is not None else None,
                "action": r.action,
                "entity": r.entity,
                "entity_id": r.entity_id,
                "details": r.details,
                "ip": r.ip,
                "user_agent": r.user_agent,
            }
            for r in rows
        ],
    }
