from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String

from ..database import Base


class StaffTicket(Base):
    __tablename__ = "staff_tickets"

    id = Column(Integer, primary_key=True, index=True)
    created_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)
    assigned_to_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)

    status = Column(String, nullable=False, default="open")  # open | closed
    subject = Column(String, nullable=False)
    details = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StaffTicketMessage(Base):
    __tablename__ = "staff_ticket_messages"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("staff_tickets.id"), nullable=False, index=True)
    author_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)

    message = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

