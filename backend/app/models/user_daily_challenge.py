from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Text, UniqueConstraint

from ..database import Base


class UserDailyChallenge(Base):
    __tablename__ = "user_daily_challenges"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    tasks_json = Column(Text, nullable=False)  # list[{id,text,category}]
    completed_task_ids_json = Column(Text, nullable=False, default="[]")
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_user_daily_challenges_user_date"),)

