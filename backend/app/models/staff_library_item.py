from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String

from ..database import Base


class StaffLibraryItem(Base):
    __tablename__ = "staff_library_items"

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)

    kind = Column(String, nullable=False)  # "document" | "image"
    folder = Column(String, nullable=False, default="general")  # "documents" | "images" | "training" | "general"

    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    original_filename = Column(String, nullable=True)
    content_type = Column(String, nullable=True)
    tags = Column(String, nullable=True)  # stored as ",tag1,tag2," for simple contains filtering

    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by_staff_user_id = Column(Integer, nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
