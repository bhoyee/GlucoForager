from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from ..database import Base


class DunningEmailLog(Base):
    """One row per actual dunning/win-back email send - separate from the running
    dunning_emails_sent counter on User (which only tracks progress through the
    sequence), so admins can see exactly which email went to which user and when."""

    __tablename__ = "dunning_email_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Email snapshotted at send time - a user could change their email later, and
    # this should still show what address the message actually went to.
    email = Column(String, nullable=False)
    stage = Column(String, nullable=False, index=True)  # day0 | day7 | day14 | day21 | monthly
    subject = Column(String, nullable=False)
    sent_at = Column(DateTime, default=datetime.utcnow, index=True)
