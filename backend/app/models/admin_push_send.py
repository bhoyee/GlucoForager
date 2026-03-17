from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base


class AdminPushSend(Base):
    __tablename__ = "admin_push_sends"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("admin_push_campaigns.id"), nullable=False, index=True)
    provider = Column(String, nullable=False, index=True)  # expo
    mode = Column(String, nullable=False, index=True)  # send_now | resend
    status = Column(String, nullable=False, index=True)  # queued | sending | sent | failed
    queued_at = Column(DateTime, default=datetime.utcnow, index=True)
    started_at = Column(DateTime, nullable=True, index=True)
    finished_at = Column(DateTime, nullable=True, index=True)
    total_tokens = Column(Integer, nullable=True)
    success_count = Column(Integer, nullable=True)
    failure_count = Column(Integer, nullable=True)
    error_summary = Column(Text, nullable=True)


class AdminPushSendFailure(Base):
    __tablename__ = "admin_push_send_failures"

    id = Column(Integer, primary_key=True, index=True)
    push_send_id = Column(Integer, ForeignKey("admin_push_sends.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    push_token_id = Column(Integer, ForeignKey("push_tokens.id"), nullable=True, index=True)
    token = Column(String, nullable=True, index=True)
    error = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

