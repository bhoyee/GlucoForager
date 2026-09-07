from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from ..database import Base


class GlucoseReading(Base):
    __tablename__ = "glucose_readings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    value_mg_dl = Column(Integer, nullable=False)
    note = Column(String, nullable=True)
    logged_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
