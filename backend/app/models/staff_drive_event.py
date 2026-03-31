from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String

from ..database import Base


class StaffDriveEvent(Base):
    __tablename__ = "staff_drive_events"

    id = Column(Integer, primary_key=True, index=True)
    drive_file_id = Column(Integer, ForeignKey("staff_drive_files.id"), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)

    action = Column(String, nullable=False)  # upload | preview | download | soft_delete | restore | purge
    details = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

