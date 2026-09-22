from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class SubscriptionEvent(Base):
    """Immutable log of every RevenueCat webhook event, one row per event.

    Subscription rows are mutated in place on each renewal (they track
    current state), so they can't answer "what happened over time" - this
    table is the append-only history behind the admin Transactions view.
    """

    __tablename__ = "subscription_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=True, index=True)
    event_type = Column(String, nullable=False)
    plan = Column(String, nullable=True)
    status = Column(String, nullable=True)
    started_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    transaction_id = Column(String, nullable=True)
    original_transaction_id = Column(String, nullable=True)
    product_id = Column(String, nullable=True)
    store = Column(String, nullable=True)
    environment = Column(String, nullable=True)
    occurred_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")
    subscription = relationship("Subscription")
