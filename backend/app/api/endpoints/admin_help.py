from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.staff_ticket import StaffTicket, StaffTicketMessage
from ...models.staff_user import StaffUser


router = APIRouter(prefix="/admin/help", tags=["admin-help"])


class TicketCreatePayload(BaseModel):
    subject: str = Field(..., min_length=3, max_length=140)
    message: str = Field(..., min_length=3, max_length=2000)


class TicketMessagePayload(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


@router.get("/tickets")
def list_tickets(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),
):
    q = db.query(StaffTicket)
    if status_filter in {"open", "closed"}:
        q = q.filter(StaffTicket.status == status_filter)
    q = q.order_by(StaffTicket.updated_at.desc())
    tickets = q.limit(200).all()

    # MVP: show all tickets to all staff (support/dev/hr need this).
    # Later: restrict by role or assignment.
    out: list[dict] = []
    for t in tickets:
        out.append(
            {
                "id": t.id,
                "subject": t.subject,
                "status": t.status,
                "created_by_staff_user_id": t.created_by_staff_user_id,
                "assigned_to_staff_user_id": t.assigned_to_staff_user_id,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            }
        )
    return {"items": out, "me": {"id": current_staff.id, "email": current_staff.email}}


@router.get("/tickets/{ticket_id}")
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),  # noqa: ARG001
):
    t = db.query(StaffTicket).filter(StaffTicket.id == int(ticket_id)).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
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
            "created_by_staff_user_id": t.created_by_staff_user_id,
            "assigned_to_staff_user_id": t.assigned_to_staff_user_id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
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
    payload: TicketCreatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),
):
    t = StaffTicket(
        created_by_staff_user_id=current_staff.id,
        assigned_to_staff_user_id=None,
        status="open",
        subject=payload.subject.strip()[:140],
        details=None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(t)
    db.flush()
    msg = StaffTicketMessage(
        ticket_id=t.id,
        author_staff_user_id=current_staff.id,
        message=payload.message.strip()[:2000],
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    db.commit()
    return {"ok": True, "id": t.id}


@router.post("/tickets/{ticket_id}/messages")
def add_message(
    ticket_id: int,
    payload: TicketMessagePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),
):
    t = db.query(StaffTicket).filter(StaffTicket.id == int(ticket_id)).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if t.status != "open":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ticket is closed")
    msg = StaffTicketMessage(
        ticket_id=t.id,
        author_staff_user_id=current_staff.id,
        message=payload.message.strip()[:2000],
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    t.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/tickets/{ticket_id}/close")
def close_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),  # noqa: ARG001
):
    t = db.query(StaffTicket).filter(StaffTicket.id == int(ticket_id)).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    t.status = "closed"
    t.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}

