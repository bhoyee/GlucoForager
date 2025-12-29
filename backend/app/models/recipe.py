from sqlalchemy import Column, Float, Integer, String, JSON

from ..database import Base


class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=False)
    ingredients = Column(JSON, nullable=False)  # [{name, quantity, unit}]
    instructions = Column(JSON, nullable=False)  # ["Step 1", "Step 2", ...]
    prep_time = Column(Integer, nullable=False)
    cook_time = Column(Integer, nullable=False)
    total_time = Column(Integer, nullable=False)
    difficulty = Column(String, nullable=False, default="Easy")
    nutritional_info = Column(JSON, nullable=False)
    tags = Column(JSON, nullable=False)
    image_url = Column(String, nullable=True)
    servings = Column(Integer, nullable=False, default=2)
    glycemic_index = Column(Float, nullable=True)
