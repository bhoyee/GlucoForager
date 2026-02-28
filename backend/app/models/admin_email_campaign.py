from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base


class AdminEmailCampaign(Base):
    __tablename__ = "admin_email_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String, nullable=False, index=True)  # user_email | newsletter
    mode = Column(String, nullable=False, index=True)  # test | single | broadcast
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    body_html = Column(Boolean, default=False)
    test_email = Column(String, nullable=True)
    recipient_email = Column(String, nullable=True)
    sent_count = Column(Integer, default=0)
    total_count = Column(Integer, nullable=True)
    created_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    deleted_at = Column(DateTime, nullable=True, index=True)

