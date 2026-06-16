from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...api.dependencies import get_current_user
from ...database import get_db
from ...models.subscription import Subscription
from ...models.user import User
from ...services.stripe_handler import StripeHandler
from ...services.subscription_service import get_effective_subscription_tier

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])
stripe_handler = StripeHandler()


@router.get("/me")
def get_my_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    latest = (
        db.query(Subscription)
        .filter(Subscription.user_id == current_user.id)
        .order_by(Subscription.started_at.desc())
        .first()
    )
    effective_tier = get_effective_subscription_tier(db, current_user)
    plan = latest.plan if latest else effective_tier
    status = latest.status if latest else "active" if effective_tier == "premium" else "inactive"
    return {"plan": plan, "status": status}


@router.post("/checkout")
def create_checkout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session_info = stripe_handler.create_checkout_session(current_user.id)
    db.add(Subscription(user_id=current_user.id, plan="premium", status="pending"))
    db.commit()
    return session_info


@router.post("/upgrade")
def upgrade_to_premium(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Premium is managed through App Store or Google Play. Start the 7-day trial in the app.",
    )
