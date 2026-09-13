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
    # Resend's own id for this send - the join key for matching an incoming
    # email.opened/email.clicked webhook back to this row. Null if the email fell
    # back to plain SMTP (no per-message id available to track in that path).
    resend_email_id = Column(String, nullable=True, index=True)
    # First-open/first-click only - a webhook fires again on every subsequent
    # open/click, and the "first time" is what's actually useful to see.
    opened_at = Column(DateTime, nullable=True)
    clicked_at = Column(DateTime, nullable=True)
    clicked_link = Column(String, nullable=True)
