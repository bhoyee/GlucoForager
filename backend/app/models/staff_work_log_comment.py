from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from ..database import Base


class StaffWorkLogComment(Base):
    __tablename__ = "staff_work_log_comments"

    id = Column(Integer, primary_key=True, index=True)
    work_log_id = Column(Integer, ForeignKey("staff_work_logs.id"), nullable=False, index=True)
    author_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)
    comment = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

