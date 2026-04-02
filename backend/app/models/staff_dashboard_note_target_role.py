from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer

from ..database import Base


class StaffDashboardNoteTargetRole(Base):
    __tablename__ = "staff_dashboard_note_target_roles"

    note_id = Column(Integer, ForeignKey("staff_dashboard_notes.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(Integer, ForeignKey("staff_roles.id", ondelete="CASCADE"), primary_key=True)

