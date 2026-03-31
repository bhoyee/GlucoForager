from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, JSON, String

from ..database import Base


class StaffAuditLog(Base):
    __tablename__ = "staff_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, nullable=True, index=True)
    action = Column(String, nullable=False)  # e.g. "login", "create_staff_user", "update_role"
    entity = Column(String, nullable=True)  # e.g. "staff_user"
    entity_id = Column(String, nullable=True)
    details = Column(JSON, nullable=True)
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

