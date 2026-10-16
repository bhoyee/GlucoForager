from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base


class FeatureUsageWeekly(Base):
    """Free-tier AI usage per user, per feature, per week (weeks start Monday UTC)."""

    __tablename__ = "feature_usage_weekly"
    __table_args__ = (UniqueConstraint("user_id", "feature", "week_start", name="uq_feature_usage_user_feature_week"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    feature = Column(String, nullable=False)
    week_start = Column(Date, nullable=False)
    used = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
