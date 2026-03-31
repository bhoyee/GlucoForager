from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from ..database import Base


class StaffRole(Base):
    __tablename__ = "staff_roles"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)  # e.g. "admin"
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
