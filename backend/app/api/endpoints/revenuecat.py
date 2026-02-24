from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from ...core.config import settings
from ...database import get_db
from ...models.subscription import Subscription
from ...models.user import User
from ...services.email_service import send_premium_activated_email
from ...services.subscription_service import refresh_user_tier

router = APIRouter(prefix="/revenuecat", tags=["revenuecat"])
logger = logging.getLogger("glucoforager.revenuecat")

ACTIVE_EVENTS = {
    "INITIAL_PURCHASE",
    "RENEWAL",
    "PRODUCT_CHANGE",
    "UNCANCELLATION",
}
INACTIVE_EVENTS = {
    "CANCELLATION",
    "EXPIRATION",
    "BILLING_ISSUE",
    "REFUND",
}


def _parse_expiry(event: dict) -> datetime | None:
    expiry_ms = event.get("expiration_at_ms") or event.get("expires_at_ms")
    if not expiry_ms:
        return None
    try:
        return datetime.fromtimestamp(int(expiry_ms) / 1000, tz=timezone.utc)
    except (ValueError, TypeError):
        return None


def _is_active(expiry: datetime | None) -> bool:
    if not expiry:
        return False
    return expiry > datetime.now(tz=timezone.utc)


@router.post("/webhook")
async def revenuecat_webhook(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
):
    secret = settings.revenuecat_webhook_secret
    if secret:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing webhook auth")
        token = authorization.replace("Bearer ", "", 1).strip()
        if token != secret:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook auth")

    payload = await request.json()
    event = payload.get("event") or {}
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")
    subscriber_attrs = event.get("subscriber_attributes") or {}
    email_attr = subscriber_attrs.get("$email") or {}
    email_value = email_attr.get("value")

    if not app_user_id or not event_type:
        logger.warning("Invalid payload: app_user_id=%s event_type=%s", app_user_id, event_type)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload")

    user = None
    if app_user_id:
        try:
            user_id = int(app_user_id)
            user = db.query(User).filter(User.id == user_id).first()
        except ValueError:
            user = None
    if not user and app_user_id:
        user = db.query(User).filter(User.public_id == app_user_id).first()
    if not user and email_value:
        user = db.query(User).filter(User.email == email_value.lower()).first()
    if not user:
        logger.warning(
            "User not found for webhook: app_user_id=%s email=%s type=%s",
            app_user_id,
            email_value,
            event_type,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found")

    expiry = _parse_expiry(event)
    is_active = _is_active(expiry)
    plan = "premium" if is_active else "free"
    status_value = "active" if is_active else "inactive"
    transaction_id = event.get("transaction_id")
    original_transaction_id = event.get("original_transaction_id")
    product_id = event.get("product_id")
    store = event.get("store")
    environment = event.get("environment")

    if event_type in INACTIVE_EVENTS:
        plan = "free"
        status_value = "inactive"

    sub_query = db.query(Subscription).filter(Subscription.user_id == user.id)
    if store:
        sub_query = sub_query.filter(Subscription.store == store)
    if original_transaction_id:
        sub_query = sub_query.filter(Subscription.original_transaction_id == original_transaction_id)
    elif transaction_id:
        sub_query = sub_query.filter(Subscription.transaction_id == transaction_id)

    subscription = sub_query.order_by(Subscription.started_at.desc()).first()
    if not subscription:
        subscription = Subscription(
            user_id=user.id,
            started_at=datetime.utcnow(),
            transaction_id=transaction_id,
            original_transaction_id=original_transaction_id,
            product_id=product_id,
            store=store,
            environment=environment,
        )

    subscription.plan = plan
    subscription.status = status_value
    subscription.expires_at = expiry
    subscription.transaction_id = transaction_id or subscription.transaction_id
    subscription.original_transaction_id = original_transaction_id or subscription.original_transaction_id
    subscription.product_id = product_id or subscription.product_id
    subscription.store = store or subscription.store
    subscription.environment = environment or subscription.environment

    db.add(subscription)
    refresh_user_tier(db, user)
    db.commit()

    if event_type == "INITIAL_PURCHASE":
        try:
            send_premium_activated_email(user.email, user.full_name)
        except Exception:
            logger.exception("Failed to send premium activation email for user_id=%s", user.id)
    logger.info(
        "Webhook processed: user_id=%s plan=%s status=%s expires_at=%s",
        user.id,
        plan,
        status_value,
        expiry.isoformat() if expiry else None,
    )
    return {"detail": "ok"}
