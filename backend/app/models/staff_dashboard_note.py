from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base


class StaffDashboardNote(Base):
    __tablename__ = "staff_dashboard_notes"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String(160), nullable=False)
    body = Column(Text, nullable=False)
    meeting_url = Column(String(512), nullable=True)

    # Visibility window in UTC.
    visible_from = Column(DateTime, nullable=True)
    visible_until = Column(DateTime, nullable=True)

    status = Column(String(32), nullable=False, default="draft")  # draft | published
    target_all = Column(Boolean, nullable=False, default=True)

    created_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    updated_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)

    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

