from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from ..database import Base


class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    status = Column(String, nullable=False, default="draft")  # draft | finalized | paid (later)

    created_by_staff_user_id = Column(Integer, nullable=True, index=True)
    finalized_at = Column(DateTime, nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

