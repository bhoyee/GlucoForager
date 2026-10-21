from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from ..database import Base


class FoodImage(Base):
    """Shared photo library for simple foods (swap options, searched foods).

    One row per normalised food name; generated once and reused for every user.
    """

    __tablename__ = "food_images"

    key = Column(String(80), primary_key=True)
    name = Column(String(120), nullable=False)
    image_url = Column(String(500), nullable=True)
    # "ready" | "failed"
    status = Column(String(16), nullable=False, default="ready")
    source = Column(String(16), nullable=False, default="ai")
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
