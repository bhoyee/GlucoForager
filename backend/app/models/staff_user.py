from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from ..database import Base


class StaffUser(Base):
    __tablename__ = "staff_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    timezone = Column(String, nullable=False, default="UTC")
    is_active = Column(Boolean, nullable=False, default=True)

    # Profile fields
    full_name = Column(String, nullable=True)
    country = Column(String, nullable=True)
    address = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    gender = Column(String, nullable=True)

    next_of_kin_name = Column(String, nullable=True)
    next_of_kin_contact = Column(String, nullable=True)
    next_of_kin_relationship = Column(String, nullable=True)
    next_of_kin_address = Column(String, nullable=True)

    avatar_url = Column(String, nullable=True)

    # Public-facing stable identifier (do not expose numeric id in UI)
    employee_code = Column(String, unique=True, index=True, nullable=True)

    mfa_enabled = Column(Boolean, nullable=False, default=False)
    mfa_method = Column(String, nullable=True)  # e.g. "email"

    deleted_at = Column(DateTime, nullable=True, index=True)
    deleted_by_staff_user_id = Column(Integer, nullable=True, index=True)
    delete_reason = Column(String, nullable=True)

    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
