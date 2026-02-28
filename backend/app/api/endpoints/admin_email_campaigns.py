from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.admin_email_campaign import AdminEmailCampaign
from ...models.admin_user import AdminUser

router = APIRouter(prefix="/admin/email-campaigns", tags=["admin-email-campaigns"])


class CampaignItem(BaseModel):
    id: int
    kind: str
    mode: str
    subject: str
    sent_count: int
    total_count: int | None = None
    created_at: datetime | None = None
    created_by: str | None = None


class CampaignListResponse(BaseModel):
    items: list[CampaignItem]
    page: int
    page_size: int
    total: int


@router.get("", response_model=CampaignListResponse)
def list_campaigns(
    kind: str | None = None,
    q: str | None = None,
    sort: str | None = None,
    order: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    sort_key = (sort or "created_at").strip().lower()
    sort_order = (order or "desc").strip().lower()

    query = (
        db.query(AdminEmailCampaign, AdminUser.email.label("admin_email"))
        .outerjoin(AdminUser, AdminEmailCampaign.created_by_admin_id == AdminUser.id)
        .filter(AdminEmailCampaign.deleted_at.is_(None))
    )
    if kind:
        query = query.filter(AdminEmailCampaign.kind == kind.strip().lower())
    if q:
        term = f"%{q.strip().lower()}%"
        query = query.filter(func.lower(AdminEmailCampaign.subject).like(term))

    if sort_key == "sent_count":
        order_column = AdminEmailCampaign.sent_count
    else:
        order_column = AdminEmailCampaign.created_at

    if sort_order == "asc":
        query = query.order_by(order_column.asc(), AdminEmailCampaign.id.asc())
    else:
        query = query.order_by(desc(order_column), desc(AdminEmailCampaign.id))

    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return CampaignListResponse(
        items=[
            CampaignItem(
                id=campaign.id,
                kind=campaign.kind,
                mode=campaign.mode,
                subject=campaign.subject,
                sent_count=int(campaign.sent_count or 0),
                total_count=campaign.total_count,
                created_at=campaign.created_at,
                created_by=admin_email,
            )
            for (campaign, admin_email) in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/{campaign_id}", response_model=dict)
def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    row = db.query(AdminEmailCampaign).filter(
        AdminEmailCampaign.id == campaign_id,
        AdminEmailCampaign.deleted_at.is_(None),
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return {
        "id": row.id,
        "kind": row.kind,
        "mode": row.mode,
        "subject": row.subject,
        "body": row.body,
        "body_html": bool(row.body_html),
        "test_email": row.test_email,
        "recipient_email": row.recipient_email,
        "sent_count": row.sent_count or 0,
        "total_count": row.total_count,
        "created_by_admin_id": row.created_by_admin_id,
        "created_at": row.created_at,
    }


@router.delete("/{campaign_id}", status_code=204)
def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
):
    row = db.query(AdminEmailCampaign).filter(
        AdminEmailCampaign.id == campaign_id,
        AdminEmailCampaign.deleted_at.is_(None),
    ).first()
    if not row:
        return
    row.deleted_at = datetime.utcnow()
    db.commit()
    return
