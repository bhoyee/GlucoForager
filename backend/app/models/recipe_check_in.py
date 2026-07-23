from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base


class RecipeCheckIn(Base):
    __tablename__ = "recipe_check_ins"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    recipe_fingerprint = Column(String, nullable=False, index=True)
    recipe_name = Column(String, nullable=False)
    feeling = Column(String, nullable=False)  # great | ok | not_great
    check_in_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "user_id", "recipe_fingerprint", "check_in_date", name="uq_recipe_check_ins_user_fingerprint_date"
        ),
    )
