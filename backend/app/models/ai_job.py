from datetime import datetime

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String

from ..database import Base


class AIJob(Base):
    __tablename__ = "ai_jobs"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source = Column(String, nullable=False)  # text | vision
    status = Column(String, nullable=False, default="pending")
    payload = Column(JSON, nullable=True)
    result = Column(JSON, nullable=True)
    error = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
