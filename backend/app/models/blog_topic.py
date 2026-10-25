from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, JSON, String

from ..database import Base


class BlogTopic(Base):
    """One researched search topic for the blog autopilot. The Sunday research run
    plans the week (status "planned" with a planned_for date, plus "reserve" spares);
    each draft day claims its topic and links the draft it wrote."""

    __tablename__ = "blog_topics"

    id = Column(Integer, primary_key=True, index=True)
    week_of = Column(Date, nullable=False, index=True)  # Monday of the planned week
    keyword = Column(String, nullable=False)
    title_idea = Column(String, nullable=True)
    angle = Column(String, nullable=True)
    questions = Column(JSON, nullable=True)  # list[str] real searches to answer in the FAQ
    related = Column(JSON, nullable=True)  # list[str] related searches in the same cluster
    signals = Column(JSON, nullable=True)  # {countries, engines, bing_volume, trend, ...}
    score = Column(Float, nullable=False, default=0.0)
    reason = Column(String, nullable=True)
    status = Column(String, nullable=False, default="reserve", index=True)  # planned|reserve|drafting|drafted|skipped|failed
    planned_for = Column(Date, nullable=True, index=True)
    post_id = Column(Integer, ForeignKey("blog_posts.id", ondelete="SET NULL"), nullable=True)
    error = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
