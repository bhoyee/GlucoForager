from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.subscription_event import SubscriptionEvent
from ...models.user import User
from ...services.cache_service import CacheService
from ...services.revenuecat_metrics_service import get_overview_metrics

router = APIRouter(prefix="/admin", tags=["admin"])
cache = CacheService()

STORE_LABELS = {
    "PLAY_STORE": "Play Store",
    "APP_STORE": "App Store",
    "MAC_APP_STORE": "Mac App Store",
    "STRIPE": "Stripe",
    "PROMOTIONAL": "Promotional",
    "AMAZON": "Amazon",
    "ROKU": "Roku",
    "PADDLE": "Paddle",
}


@router.get("/revenuecat/overview")
def admin_revenuecat_overview(_admin=Depends(get_current_admin)):
    return get_overview_metrics(cache)


@router.get("/revenuecat/transactions")
def list_revenuecat_transactions(
    q: str | None = None,
    display_type: str | None = None,
    store: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    query = (
        db.query(SubscriptionEvent, User.public_id, User.email)
        .join(User, User.id == SubscriptionEvent.user_id)
        # Only rows tied to an actual payment - drops trial starts/ends, cancellations,
        # expirations, and the pre-fix backfill rows, none of which carry a price.
        .filter(SubscriptionEvent.price_usd.is_not(None), SubscriptionEvent.price_usd != 0)
    )

    if q:
        search = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(func.coalesce(User.public_id, "")).like(search)
            | func.lower(func.coalesce(User.email, "")).like(search)
            | func.lower(func.coalesce(SubscriptionEvent.product_id, "")).like(search)
            | func.lower(func.coalesce(SubscriptionEvent.transaction_id, "")).like(search)
        )
    if display_type:
        query = query.filter(SubscriptionEvent.display_type == display_type)
    if store:
        query = query.filter(SubscriptionEvent.store == store)

    total = query.count()
    rows = (
        query.order_by(SubscriptionEvent.occurred_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = [
        {
            "id": evt.id,
            "app_user_id": public_id,
            "email": email,
            "event_type": evt.event_type,
            "display_type": evt.display_type or evt.event_type,
            "plan": evt.plan,
            "status": evt.status,
            "store": evt.store,
            "store_label": STORE_LABELS.get(evt.store, evt.store),
            "product_id": evt.product_id,
            "transaction_id": evt.transaction_id,
            "occurred_at": evt.occurred_at,
            "started_at": evt.started_at,
            "expires_at": evt.expires_at,
            "price_usd": float(evt.price_usd) if evt.price_usd is not None else None,
            "currency": evt.currency,
        }
        for evt, public_id, email in rows
    ]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/revenuecat/transactions/summary")
def revenuecat_transactions_summary(
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    now = datetime.utcnow()
    year_start = datetime(now.year, 1, 1)
    month_start = datetime(now.year, now.month, 1)

    def total_since(start: datetime | None) -> float:
        revenue_query = db.query(func.coalesce(func.sum(SubscriptionEvent.price_usd), 0)).filter(
            SubscriptionEvent.price_usd.is_not(None)
        )
        if start is not None:
            revenue_query = revenue_query.filter(SubscriptionEvent.occurred_at >= start)
        return float(revenue_query.scalar() or 0)

    return {
        "all_time": total_since(None),
        "current_year": total_since(year_start),
        "current_month": total_since(month_start),
        "currency": "USD",
    }
