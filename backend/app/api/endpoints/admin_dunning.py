from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.admin_user import AdminUser
from ...models.dunning_email_log import DunningEmailLog
from ...models.user import User

router = APIRouter(prefix="/admin/dunning", tags=["admin-dunning"])


class DunningLogItem(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_name: str | None = None
    stage: str
    subject: str
    sent_at: datetime | None = None


class DunningLogListResponse(BaseModel):
    items: list[DunningLogItem]
    page: int
    page_size: int
    total: int


@router.get("", response_model=DunningLogListResponse)
def list_dunning_logs(
    stage: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    query = db.query(DunningEmailLog, User.full_name).outerjoin(User, DunningEmailLog.user_id == User.id)
    if stage:
        query = query.filter(DunningEmailLog.stage == stage.strip().lower())
    if q:
        term = f"%{q.strip().lower()}%"
        query = query.filter(func.lower(DunningEmailLog.email).like(term))

    query = query.order_by(desc(DunningEmailLog.sent_at), desc(DunningEmailLog.id))

    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return DunningLogListResponse(
        items=[
            DunningLogItem(
                id=log.id,
                user_id=log.user_id,
                user_email=log.email,
                user_name=full_name,
                stage=log.stage,
                subject=log.subject,
                sent_at=log.sent_at,
            )
            for (log, full_name) in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
    )
