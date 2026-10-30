from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String

from ..database import Base


class BusinessIncome(Base):
    """Money the business received (app store payouts, Stripe, other), for the tax-year accounts."""

    __tablename__ = "business_income"

    id = Column(Integer, primary_key=True, index=True)
    created_by_staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)

    income_date = Column(Date, nullable=False, index=True)
    source = Column(String, nullable=False, default="other")
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, nullable=False, default="GBP")
    amount_gbp = Column(Numeric(12, 2), nullable=True)
    exchange_rate_to_gbp = Column(Numeric(18, 8), nullable=True)
    exchange_rate_source = Column(String, nullable=True)
    converted_at = Column(DateTime, nullable=True)
    note = Column(String, nullable=True)

    # Payout statement or invoice (private drive storage).
    document_storage_backend = Column(String, nullable=True)
    document_remote_dir = Column(String, nullable=True)
    document_filename = Column(String, nullable=True)
    document_original_name = Column(String, nullable=True)
    document_content_type = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
