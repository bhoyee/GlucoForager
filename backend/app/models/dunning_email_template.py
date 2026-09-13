from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base


class DunningEmailTemplate(Base):
    """Editable content for each stage of the win-back sequence. The scheduler reads
    these at send time, so a saved edit here takes effect on the very next send for
    that stage - no deploy needed. body_html may contain a {{name}} placeholder,
    replaced with the recipient's first name (or "there") at send time."""

    __tablename__ = "dunning_email_templates"

    id = Column(Integer, primary_key=True, index=True)
    stage = Column(String, nullable=False, unique=True, index=True)  # day0 | day7 | day14 | day21 | monthly
    subject = Column(String, nullable=False)
    heading = Column(String, nullable=False)
    body_html = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
