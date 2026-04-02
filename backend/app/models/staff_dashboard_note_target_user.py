from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer

from ..database import Base


class StaffDashboardNoteTargetUser(Base):
    __tablename__ = "staff_dashboard_note_target_users"

    note_id = Column(Integer, ForeignKey("staff_dashboard_notes.id", ondelete="CASCADE"), primary_key=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id", ondelete="CASCADE"), primary_key=True)

