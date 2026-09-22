from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String
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
    period_type = Column(String, nullable=True)
    is_trial_conversion = Column(Boolean, nullable=True)
    price_usd = Column(Numeric(10, 2), nullable=True)
    price_in_purchased_currency = Column(Numeric(10, 2), nullable=True)
    currency = Column(String, nullable=True)
    # Human-readable classification (Renewal, Trial Converted, Trial Ended, ...),
    # computed once from event_type/period_type/is_trial_conversion at webhook time.
    display_type = Column(String, nullable=True)

    user = relationship("User")
    subscription = relationship("Subscription")
