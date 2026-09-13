from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.admin_user import AdminUser
from ...models.dunning_email_log import DunningEmailLog
from ...models.dunning_email_template import DunningEmailTemplate
from ...models.user import User

router = APIRouter(prefix="/admin/dunning", tags=["admin-dunning"])

STAGE_ORDER = ["day0", "day7", "day14", "day21", "monthly"]


class DunningSummaryResponse(BaseModel):
    days: int
    sent: int
    opened: int
    clicked: int


@router.get("/summary", response_model=DunningSummaryResponse)
def get_dunning_summary(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    since = datetime.utcnow() - timedelta(days=days)
    base = db.query(DunningEmailLog).filter(DunningEmailLog.sent_at >= since)
    sent = base.count()
    opened = base.filter(DunningEmailLog.opened_at.isnot(None)).count()
    clicked = base.filter(DunningEmailLog.clicked_at.isnot(None)).count()
    return DunningSummaryResponse(days=days, sent=sent, opened=opened, clicked=clicked)


class DunningLogItem(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_name: str | None = None
    stage: str
    subject: str
    sent_at: datetime | None = None
    opened_at: datetime | None = None
    clicked_at: datetime | None = None
    clicked_link: str | None = None


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
                opened_at=log.opened_at,
                clicked_at=log.clicked_at,
                clicked_link=log.clicked_link,
            )
            for (log, full_name) in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
    )


class DunningTemplateItem(BaseModel):
    stage: str
    subject: str
    heading: str
    body_html: str
    updated_at: datetime | None = None
    updated_by: str | None = None


class DunningTemplateListResponse(BaseModel):
    items: list[DunningTemplateItem]


class DunningTemplateUpdatePayload(BaseModel):
    subject: str = Field(..., min_length=1, max_length=200)
    heading: str = Field(..., min_length=1, max_length=200)
    body_html: str = Field(..., min_length=1, max_length=20000)


@router.get("/templates", response_model=DunningTemplateListResponse)
def list_dunning_templates(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    rows = (
        db.query(DunningEmailTemplate, AdminUser.email)
        .outerjoin(AdminUser, DunningEmailTemplate.updated_by_admin_id == AdminUser.id)
        .all()
    )
    by_stage = {row.stage: (row, admin_email) for (row, admin_email) in rows}
    return DunningTemplateListResponse(
        items=[
            DunningTemplateItem(
                stage=stage,
                subject=row.subject,
                heading=row.heading,
                body_html=row.body_html,
                updated_at=row.updated_at,
                updated_by=admin_email,
            )
            for stage in STAGE_ORDER
            if stage in by_stage
            for (row, admin_email) in [by_stage[stage]]
        ]
    )


@router.put("/templates/{stage}", response_model=DunningTemplateItem)
def update_dunning_template(
    stage: str,
    payload: DunningTemplateUpdatePayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    row = db.query(DunningEmailTemplate).filter(DunningEmailTemplate.stage == stage).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    row.subject = payload.subject.strip()
    row.heading = payload.heading.strip()
    row.body_html = payload.body_html
    row.updated_at = datetime.utcnow()
    row.updated_by_admin_id = current_admin.id
    db.commit()
    db.refresh(row)

    return DunningTemplateItem(
        stage=row.stage,
        subject=row.subject,
        heading=row.heading,
        body_html=row.body_html,
        updated_at=row.updated_at,
        updated_by=current_admin.email,
    )
