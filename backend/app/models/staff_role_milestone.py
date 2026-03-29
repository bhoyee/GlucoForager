from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String

from ..database import Base


class StaffRoleMilestone(Base):
    __tablename__ = "staff_role_milestones"

    id = Column(Integer, primary_key=True, index=True)

    role_key = Column(String, nullable=False, index=True)  # e.g. "designer", "hr"
    cadence = Column(String, nullable=False, index=True)  # "weekly" | "monthly"

    period_start = Column(Date, nullable=False, index=True)
    period_end = Column(Date, nullable=True, index=True)

    title = Column(String, nullable=False)
    description = Column(String, nullable=True)

    is_completed = Column(Boolean, nullable=False, default=False, index=True)
    completed_at = Column(DateTime, nullable=True)
    completed_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)

    deleted_at = Column(DateTime, nullable=True, index=True)
    deleted_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)

    created_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

