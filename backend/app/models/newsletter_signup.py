from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from ..database import Base


class NewsletterSignup(Base):
    __tablename__ = "newsletter_signups"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    source = Column(String, nullable=True)
    status = Column(String, nullable=False, default="subscribed", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=True)

