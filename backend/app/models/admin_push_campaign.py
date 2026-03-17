from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base


class AdminPushCampaign(Base):
    __tablename__ = "admin_push_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    deeplink = Column(String, nullable=True)
    audience = Column(String, nullable=False, index=True)  # all
    status = Column(String, nullable=False, index=True)  # draft | archived
    created_by_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, index=True)
    deleted_at = Column(DateTime, nullable=True, index=True)

