from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String

from ..database import Base


class StaffDriveFile(Base):
    __tablename__ = "staff_drive_files"

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    original_filename = Column(String, nullable=True)
    content_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)

    storage_backend = Column(String, nullable=False, default="ftp")
    remote_dir = Column(String, nullable=False)
    filename = Column(String, nullable=False)

    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by_staff_user_id = Column(Integer, nullable=True, index=True)
    delete_reason = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

