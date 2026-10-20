from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String

from ..database import Base


class MealLogEntry(Base):
    __tablename__ = "meal_log_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    description = Column(String, nullable=False)
    # "manual" (free text) | "barcode" (resolved via a product lookup) | "photo" (future AI scan)
    source = Column(String, nullable=False, default="manual", server_default="manual")
    carbs_g = Column(Float, nullable=True)
    # True when carbs_g is an AI estimate from typed text (shown to the user as "about").
    carbs_estimated = Column(Boolean, nullable=False, default=False, server_default="false")
    # Short standard dish name ("Jollof rice") used to group meals in insights.
    food_name = Column(String(80), nullable=True)
    calories = Column(Integer, nullable=True)
    logged_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
