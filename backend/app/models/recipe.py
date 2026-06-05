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
    image_url = Column(String, nullable=True)
    image_prompt = Column(String, nullable=True)
    ingredients = Column(JSON, nullable=False)  # list[{name, quantity, unit, note?}]
    instructions = Column(JSON, nullable=False)  # list[str]
    nutrition = Column(JSON, nullable=True)  # {calories, carbs, protein, fat, fiber, sugar}
    cuisine_tags = Column(JSON, nullable=True)  # e.g. ["west_african", "mediterranean"]
    dietary_tags = Column(JSON, nullable=True)  # e.g. ["vegetarian", "halal"]
    allergen_tags = Column(JSON, nullable=True)  # allergens present in the recipe
    food_exclusion_tags = Column(JSON, nullable=True)  # avoid-list items present in the recipe
    goal_tags = Column(JSON, nullable=True)  # e.g. ["lower_carb", "high_protein"]
    equipment_tags = Column(JSON, nullable=True)  # e.g. ["air_fryer", "microwave"]
    diabetes_type_tags = Column(JSON, nullable=True)  # e.g. ["type_2", "prediabetes"]
    cook_time_tag = Column(String, nullable=True)  # under_15 | 15_30 | 30_45 | 45_plus
    safety_flags = Column(JSON, nullable=True)  # generated/admin review warnings, e.g. high sugar/carbs
    status = Column(String, nullable=False, default="published")  # draft | published | archived
    source = Column(String, nullable=False, default="manual")  # manual | ai_generated
    generated_by_admin_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
