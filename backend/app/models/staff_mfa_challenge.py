from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class StaffMfaChallenge(Base):
    __tablename__ = "staff_mfa_challenges"

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False, index=True)
    code_hash = Column(String, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    used_at = Column(DateTime, nullable=True)
    attempts = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    created_ip = Column(String, nullable=True)
    created_user_agent = Column(String, nullable=True)

    staff_user = relationship("StaffUser")

