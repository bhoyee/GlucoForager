from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Integer, Numeric, String

from ..database import Base


class StaffCompensation(Base):
    __tablename__ = "staff_compensation"

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, nullable=False, index=True)

    currency = Column(String, nullable=False, default="GBP")
    monthly_gross = Column(Numeric(12, 2), nullable=False, default=0)
    monthly_deductions_default = Column(Numeric(12, 2), nullable=False, default=0)
    effective_from = Column(Date, nullable=False, index=True, default=date.today)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    created_by_staff_user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

