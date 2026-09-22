"""One-time backfill of historical RevenueCat revenue into subscription_events.

Run once, on a host with both database access and REVENUECAT_SECRET_API_KEY /
REVENUECAT_PROJECT_ID configured (e.g. `docker compose exec api python
scripts/backfill_revenuecat_history.py`).

RevenueCat's public API only exposes a *lifetime* revenue total per
subscription (via GET /v2/projects/{id}/customers/{id}/subscriptions), not a
renewal-by-renewal breakdown. So each subscription becomes ONE synthetic
"Historical Revenue" event carrying its full lifetime gross revenue. The
admin summary endpoint (admin_revenuecat.py) deliberately excludes these
rows from "this year"/"this month" - only "all-time" counts them - since
attributing years of past renewals to a single date would be misleading.

Safe to re-run: skips subscriptions already backfilled (matched by
user_id + transaction_id under the HISTORICAL_BACKFILL event type).
"""

import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.subscription_event import SubscriptionEvent  # noqa: E402
from app.models.user import User  # noqa: E402

BASE_URL = "https://api.revenuecat.com/v2"
HISTORICAL_EVENT_TYPE = "HISTORICAL_BACKFILL"
HISTORICAL_DISPLAY_TYPE = "Historical Revenue"


def _ms_to_dt(ms) -> datetime | None:
    if not ms:
        return None
    return datetime.utcfromtimestamp(ms / 1000)


def _get_with_retry(client: httpx.Client, url: str, params: dict, max_attempts: int = 5) -> httpx.Response:
    delay = 1.0
    for attempt in range(max_attempts):
        resp = client.get(url, params=params)
        if resp.status_code == 429 and attempt < max_attempts - 1:
            time.sleep(delay)
            delay = min(delay * 2, 30)
            continue
        resp.raise_for_status()
        return resp
    resp.raise_for_status()
    return resp


def main() -> None:
    key = settings.revenuecat_secret_api_key
    project_id = settings.revenuecat_project_id
    if not key or not project_id:
        raise SystemExit("REVENUECAT_SECRET_API_KEY / REVENUECAT_PROJECT_ID not configured.")

    db = SessionLocal()
    stats = {
        "customers_seen": 0,
        "subs_seen": 0,
        "inserted": 0,
        "skipped_sandbox": 0,
        "skipped_no_revenue": 0,
        "skipped_existing": 0,
        "skipped_no_user": 0,
    }

    try:
        with httpx.Client(timeout=20.0, headers={"Authorization": f"Bearer {key}"}) as client:
            customers_url = f"{BASE_URL}/projects/{project_id}/customers"
            customers_params = {"limit": 100}
            page_num = 0

            while customers_url:
                resp = _get_with_retry(client, customers_url, customers_params)
                data = resp.json()
                customers = data.get("items", [])
                stats["customers_seen"] += len(customers)
                page_num += 1

                for customer in customers:
                    customer_id = customer.get("id")
                    if not customer_id:
                        continue

                    user = db.query(User).filter(User.public_id == customer_id).first()
                    if not user:
                        stats["skipped_no_user"] += 1
                        continue

                    _backfill_customer_subscriptions(client, project_id, customer_id, user, db, stats)

                customers_url = data.get("next_page")
                customers_params = {}

                if page_num % 10 == 0:
                    print(f"progress: page={page_num} {stats}")

    finally:
        db.close()

    print("done.")
    print(stats)


def _backfill_customer_subscriptions(client, project_id, customer_id, user, db, stats) -> None:
    subs_url = f"{BASE_URL}/projects/{project_id}/customers/{customer_id}/subscriptions"
    subs_params = {"limit": 50}

    while subs_url:
        resp = _get_with_retry(client, subs_url, subs_params)
        data = resp.json()

        for sub in data.get("items", []):
            stats["subs_seen"] += 1

            if (sub.get("environment") or "").lower() != "production":
                stats["skipped_sandbox"] += 1
                continue

            revenue = sub.get("total_revenue_in_usd") or {}
            gross = revenue.get("gross")
            if not gross:
                stats["skipped_no_revenue"] += 1
                continue

            transaction_id = sub.get("store_subscription_identifier") or sub.get("id")

            exists = (
                db.query(SubscriptionEvent.id)
                .filter(
                    SubscriptionEvent.user_id == user.id,
                    SubscriptionEvent.event_type == HISTORICAL_EVENT_TYPE,
                    SubscriptionEvent.transaction_id == transaction_id,
                )
                .first()
            )
            if exists:
                stats["skipped_existing"] += 1
                continue

            starts_at = _ms_to_dt(sub.get("starts_at"))
            ends_at = _ms_to_dt(sub.get("ends_at") or sub.get("current_period_ends_at"))

            db.add(
                SubscriptionEvent(
                    user_id=user.id,
                    subscription_id=None,
                    event_type=HISTORICAL_EVENT_TYPE,
                    plan="premium",
                    status=sub.get("status"),
                    started_at=starts_at,
                    expires_at=ends_at,
                    transaction_id=transaction_id,
                    original_transaction_id=transaction_id,
                    product_id=sub.get("product_id"),
                    store=(sub.get("store") or "").upper() or None,
                    environment="PRODUCTION",
                    occurred_at=starts_at or datetime.utcnow(),
                    price_usd=gross,
                    currency=revenue.get("currency") or "USD",
                    display_type=HISTORICAL_DISPLAY_TYPE,
                )
            )
            db.commit()
            stats["inserted"] += 1

        subs_url = data.get("next_page")
        subs_params = {}


if __name__ == "__main__":
    main()
