from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, JSON, String

from ..database import Base


class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    meal_type = Column(String, nullable=False)  # breakfast | lunch | dinner | snack
    description = Column(String, nullable=True)
    prep_time_minutes = Column(Integer, nullable=True)
    cook_time_minutes = Column(Integer, nullable=True)
    servings = Column(Integer, nullable=True)
    image_url = Column(String, nullable=False)
    ingredients = Column(JSON, nullable=False)  # list[{name, quantity, unit, note?}]
    instructions = Column(JSON, nullable=False)  # list[str]
    nutrition = Column(JSON, nullable=True)  # {calories, carbs, protein, fat, fiber, sugar}
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
