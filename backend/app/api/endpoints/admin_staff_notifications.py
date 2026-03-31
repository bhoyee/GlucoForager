from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_notification import StaffNotification
from ...models.staff_user import StaffUser


router = APIRouter(prefix="/admin/staff-notifications", tags=["admin-staff-notifications"])


def _now() -> datetime:
    return datetime.utcnow()


@router.get("")
def list_notifications(
    unread_only: int = 0,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    q = db.query(StaffNotification).filter(StaffNotification.staff_user_id == int(current_staff.id))
    if unread_only:
        q = q.filter(StaffNotification.read_at.is_(None))
    q = q.order_by(StaffNotification.created_at.desc())

    limit_value = max(1, min(200, int(limit)))
    offset_value = max(0, int(offset))
    rows = q.offset(offset_value).limit(limit_value).all()

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


@router.post("/{notification_id}/read")
def mark_read(
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


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    db.query(StaffNotification).filter(
        StaffNotification.staff_user_id == int(current_staff.id),
        StaffNotification.read_at.is_(None),
    ).update({"read_at": _now()}, synchronize_session=False)
    db.commit()
    return {"ok": True}

