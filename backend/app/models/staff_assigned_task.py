from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, JSON, String

from ..database import Base


class StaffAssignedTask(Base):
    __tablename__ = "staff_assigned_tasks"

    id = Column(Integer, primary_key=True, index=True)

    staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)
    assigned_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)

    work_date = Column(Date, nullable=False, index=True)
    text = Column(String, nullable=False)

    is_completed = Column(Boolean, nullable=False, default=False, index=True)
    completed_at = Column(DateTime, nullable=True)
    completed_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)
    completion_note = Column(String, nullable=True)
    proof_links = Column(JSON, nullable=False, default=list)

    deleted_at = Column(DateTime, nullable=True, index=True)
    deleted_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

