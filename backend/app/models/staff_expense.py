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
    category = Column(String, nullable=False, default="general")
    note = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

