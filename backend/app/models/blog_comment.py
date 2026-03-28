from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class BlogComment(Base):
    __tablename__ = "blog_comments"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("blog_posts.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    moderated_at = Column(DateTime, nullable=True, index=True)
    moderated_by_staff_user_id = Column(Integer, nullable=True, index=True)
    moderation_action = Column(String, nullable=True, index=True)  # approve | reject | delete
    moderation_note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=True)

    post = relationship("BlogPost", back_populates="comments")
