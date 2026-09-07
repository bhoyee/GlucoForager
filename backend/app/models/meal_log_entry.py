from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String

from ..database import Base


class MealLogEntry(Base):
    __tablename__ = "meal_log_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    description = Column(String, nullable=False)
    # "manual" (free text) | "barcode" (resolved via a product lookup) | "photo" (future AI scan)
    source = Column(String, nullable=False, default="manual", server_default="manual")
    carbs_g = Column(Float, nullable=True)
    calories = Column(Integer, nullable=True)
    logged_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
