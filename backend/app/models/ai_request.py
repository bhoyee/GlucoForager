from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship

from ..database import Base


class AIRequest(Base):
    __tablename__ = "ai_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tier = Column(String, default="free")
    request_type = Column(String, nullable=False)  # e.g., "vision", "text"
    model_used = Column(String, nullable=False)
    tokens_used = Column(Integer, default=0)
    cost_estimate = Column(Numeric(10, 4), default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="ai_requests")
