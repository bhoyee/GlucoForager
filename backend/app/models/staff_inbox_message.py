from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base


class StaffInboxMessage(Base):
    __tablename__ = "staff_inbox_messages"

    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(Integer, index=True, nullable=True)
    parent_id = Column(Integer, ForeignKey("staff_inbox_messages.id"), nullable=True, index=True)

    sender_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)
    recipient_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)

    to_email = Column(String, nullable=False, index=True)
    subject = Column(String, nullable=False)
    body_html = Column(Text, nullable=False)

    read_at = Column(DateTime, nullable=True, index=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    deleted_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

