from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String

from ..database import Base


class StaffWorkLogReminder(Base):
    __tablename__ = "staff_work_log_reminders"

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)
    work_date = Column(Date, nullable=False, index=True)
    created_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)
    message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

