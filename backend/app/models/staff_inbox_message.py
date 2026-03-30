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

    attachment_original_name = Column(String, nullable=True)
    attachment_filename = Column(String, nullable=True, index=True)
    attachment_url = Column(String, nullable=True)
    attachment_content_type = Column(String, nullable=True)
    attachment_size_bytes = Column(Integer, nullable=True)
    attachment_storage_backend = Column(String, nullable=True)
    attachment_remote_dir = Column(String, nullable=True)

    read_at = Column(DateTime, nullable=True, index=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    deleted_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
