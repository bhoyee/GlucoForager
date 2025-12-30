from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api.dependencies import get_current_user
from ...database import get_db
from ...models.subscription import Subscription
from ...models.user import User
from ...services.stripe_handler import StripeHandler

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
    plan = latest.plan if latest else current_user.subscription_tier
    status = latest.status if latest else "active" if current_user.subscription_tier == "premium" else "inactive"
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
    current_user.subscription_tier = "premium"
    db.add(Subscription(user_id=current_user.id, plan="premium", status="active"))
    db.commit()
    return {"detail": "Upgraded to premium"}
