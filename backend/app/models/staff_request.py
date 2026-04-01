from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, String

from ..database import Base


class StaffRequest(Base):
    __tablename__ = "staff_requests"

    id = Column(Integer, primary_key=True, index=True)

    staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)

    type = Column(String, nullable=False, index=True)  # day_off|annual_leave|sick_leave|training
    status = Column(String, nullable=False, index=True, default="draft")  # draft|pending|approved|rejected

    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=True, index=True)

    details = Column(String, nullable=True)
    attachments = Column(JSON, nullable=False, default=list)

    submitted_at = Column(DateTime, nullable=True, index=True)
    decided_at = Column(DateTime, nullable=True, index=True)
    decided_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)
    decision_comment = Column(String, nullable=True)

    deleted_at = Column(DateTime, nullable=True, index=True)
    deleted_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
