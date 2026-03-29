from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint

from ..database import Base


class StaffMilestoneProgress(Base):
    __tablename__ = "staff_milestone_progress"
    __table_args__ = (UniqueConstraint("staff_user_id", "milestone_id", name="uq_staff_milestone_progress_user_milestone"),)

    id = Column(Integer, primary_key=True, index=True)

    staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)
    milestone_id = Column(Integer, ForeignKey("staff_role_milestones.id"), nullable=False, index=True)

    is_completed = Column(Boolean, nullable=False, default=False, index=True)
    completed_at = Column(DateTime, nullable=True)
    completion_note = Column(String, nullable=True)
    proof_links = Column(JSON, nullable=False, default=list)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

