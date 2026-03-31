from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String

from ..database import Base


class StaffNotification(Base):
    __tablename__ = "staff_notifications"

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)

    type = Column(String, nullable=False, index=True)  # e.g. "ticket.assigned", "ticket.message"
    title = Column(String, nullable=False)
    body = Column(String, nullable=True)
    data = Column(JSON, nullable=True)

    read_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

