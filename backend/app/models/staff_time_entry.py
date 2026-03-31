from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String

from ..database import Base


class StaffTimeEntry(Base):
    __tablename__ = "staff_time_entries"

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)
    work_date = Column(Date, nullable=False, index=True)

    clock_in_at = Column(DateTime, nullable=True)
    clock_out_at = Column(DateTime, nullable=True)

    clock_in_ip = Column(String, nullable=True)
    clock_out_ip = Column(String, nullable=True)
    clock_in_reason = Column(String, nullable=True)
    clock_out_reason = Column(String, nullable=True)

    edited_at = Column(DateTime, nullable=True)
    edited_by_staff_user_id = Column(Integer, nullable=True, index=True)
    edit_reason = Column(String, nullable=True)

    approved_at = Column(DateTime, nullable=True)
    approved_by_staff_user_id = Column(Integer, nullable=True, index=True)
    approval_reason = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
