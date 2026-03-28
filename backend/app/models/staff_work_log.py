from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON

from ..database import Base


class StaffWorkLog(Base):
    __tablename__ = "staff_work_logs"

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)
    work_date = Column(Date, nullable=False, index=True)

    # Free-form JSON payload so this can serve all roles without schema churn.
    # Expected shape (frontend-enforced):
    # { "summary": "...", "tasks": [{"text":"...","done":false}], "links": ["..."] }
    payload = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

