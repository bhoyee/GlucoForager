from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String

from ..database import Base


class StaffExpense(Base):
    __tablename__ = "staff_expenses"

    id = Column(Integer, primary_key=True, index=True)
    created_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)

    expense_date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, nullable=False, default="GBP")
    amount_gbp = Column(Numeric(12, 2), nullable=True)
    exchange_rate_to_gbp = Column(Numeric(18, 8), nullable=True)
    exchange_rate_source = Column(String, nullable=True)
    converted_at = Column(DateTime, nullable=True)
    category = Column(String, nullable=False, default="general")
    note = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

