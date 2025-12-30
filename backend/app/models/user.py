from datetime import datetime, date

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    subscription_tier = Column(String, default="free")
    created_at = Column(DateTime, default=datetime.utcnow)

    searches = relationship("SearchLog", back_populates="user", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="user")
    ai_requests = relationship("AIRequest", back_populates="user", cascade="all, delete-orphan")


class SearchLog(Base):
    __tablename__ = "search_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    query = Column(String, nullable=False)
    executed_at = Column(Date, default=date.today)

    user = relationship("User", back_populates="searches")
