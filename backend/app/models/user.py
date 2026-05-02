from datetime import datetime, date

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String, unique=True, index=True, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    country = Column(String, nullable=True)
    registered_platform = Column(String, nullable=True)
    registered_app_version = Column(String, nullable=True)
    registered_build_number = Column(String, nullable=True)
    registered_os_version = Column(String, nullable=True)
    registered_device_model = Column(String, nullable=True)
    subscription_tier = Column(String, default="free")
    premium_access_blocked_at = Column(DateTime, nullable=True)
    premium_access_blocked_until = Column(DateTime, nullable=True)
    premium_access_blocked_reason = Column(String, nullable=True)
    suspended_at = Column(DateTime, nullable=True)
    suspended_reason = Column(String, nullable=True)
    last_active_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Food profile (onboarding-driven). All fields are optional so existing users are not forced.
    blood_sugar_profile = Column(String, nullable=True)
    country_code = Column(String, nullable=True)
    preferred_cuisines = Column(JSON, nullable=True)
    meal_goals = Column(JSON, nullable=True)
    dietary_pattern = Column(String, nullable=True)
    allergens = Column(JSON, nullable=True)
    food_exclusions = Column(JSON, nullable=True)
    available_equipment = Column(JSON, nullable=True)
    cook_time_preference = Column(String, nullable=True)
    profile_completed = Column(Boolean, nullable=True)

    searches = relationship("SearchLog", back_populates="user", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="user")
    ai_requests = relationship("AIRequest", back_populates="user", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")
    meal_plans = relationship("MealPlan", back_populates="user", cascade="all, delete-orphan")
    shopping_items = relationship("ShoppingItem", back_populates="user", cascade="all, delete-orphan")


class SearchLog(Base):
    __tablename__ = "search_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    device_id = Column(String, nullable=True, index=True)
    query = Column(String, nullable=False)
    executed_at = Column(Date, default=date.today)

    user = relationship("User", back_populates="searches")
