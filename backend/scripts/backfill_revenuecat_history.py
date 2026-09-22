"""One-time backfill of historical RevenueCat revenue into subscription_events.

Run once, on a host with both database access and REVENUECAT_SECRET_API_KEY /
REVENUECAT_PROJECT_ID configured (e.g. `docker compose exec api python
scripts/backfill_revenuecat_history.py`).

RevenueCat's public API only exposes a *lifetime* revenue total per
subscription (via GET /v2/projects/{id}/customers/{id}/subscriptions), not a
renewal-by-renewal breakdown - it doesn't tell us how much of that total
came from any specific cycle. Splitting it two ways:

- The subscription's *current billing cycle* (bounded by the real
  `current_period_starts_at`/`current_period_ends_at` fields) gets an
  estimated one-cycle share of the lifetime total, dated at the current
  period's start - so a renewal that happened right before we ran this
  shows up in "this month"/"this year" instead of being invisible.
- Everything before that stays dated at the subscription's original start,
  so an old subscriber's multi-year history doesn't get dumped into a
  recent period either.

The one-cycle estimate (gross / number of cycles so far, based on how many
cycle-lengths have elapsed since the original start) assumes a roughly
constant per-cycle price - it won't be exact for a subscription with price
changes or promotional pricing, but it's far more accurate than lumping
everything at the original start date, and it never changes the *total*
recorded for a subscription, only how that total is dated.

Rather than paging through every RevenueCat customer (most of whom are free
users who never subscribed - tens of thousands of API calls for a handful of
real matches), this only checks RevenueCat for users who already have a real
billing subscription row in our own `subscriptions` table. That's the exact
set of people who could possibly have revenue history, so it's both faster
and complete (no arbitrary recency cutoff needed).

Safe to re-run, and re-running is meaningful: each run re-derives a
subscription's rows from RevenueCat's current state (deleting and
recreating them if the lifetime total or the current-period split has
changed since last time), so a later renewal - or a renewal missed here the
first time because it hadn't rolled into "current period" data yet - gets
picked up and correctly dated on the next run.
"""

import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.subscription import Subscription  # noqa: E402
from app.models.subscription_event import SubscriptionEvent  # noqa: E402
from app.models.user import User  # noqa: E402

BASE_URL = "https://api.revenuecat.com/v2"
HISTORICAL_EVENT_TYPE = "HISTORICAL_BACKFILL"
HISTORICAL_DISPLAY_TYPE = "Historical Revenue"
CURRENT_PERIOD_DISPLAY_TYPE = "Renewal"
CENTS = 0.01  # amounts within a cent of each other are treated as unchanged


def _ms_to_dt(ms) -> datetime | None:
    if not ms:
        return None
    return datetime.utcfromtimestamp(ms / 1000)


def _estimate_current_period_share(sub: dict) -> float | None:
    """Fraction (0-1] of the lifetime gross estimated to belong to the current billing
    cycle. None if this is the subscription's first-ever period (nothing to split out -
    the whole gross already belongs to "now") or there isn't enough period data to
    estimate from."""
    starts_at_ms = sub.get("starts_at")
    period_start_ms = sub.get("current_period_starts_at")
    period_end_ms = sub.get("current_period_ends_at") or sub.get("ends_at")
    if not starts_at_ms or not period_start_ms or not period_end_ms:
        return None
    if period_start_ms <= starts_at_ms:
        return None
    cycle_length = period_end_ms - period_start_ms
    if cycle_length <= 0:
        return None
    periods_before_current = max(1, round((period_start_ms - starts_at_ms) / cycle_length))
    return 1.0 / (periods_before_current + 1)


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
        "candidates": 0,
        "subs_seen": 0,
        "inserted": 0,
        "resplit": 0,
        "skipped_sandbox": 0,
        "skipped_no_revenue": 0,
        "skipped_no_change": 0,
    }

    try:
        # Anyone with a non-admin (real billing) subscription row has, at minimum, gone
        # through a RevenueCat purchase flow once - this is the full candidate set.
        candidate_user_ids = (
            db.query(Subscription.user_id)
            .filter(Subscription.store.isnot(None), Subscription.store != "admin")
            .distinct()
        )
        users = db.query(User).filter(User.id.in_(candidate_user_ids)).all()
        stats["candidates"] = len(users)
        print(f"found {len(users)} users with a real billing subscription on record")

        with httpx.Client(timeout=20.0, headers={"Authorization": f"Bearer {key}"}) as client:
            for i, user in enumerate(users, start=1):
                if not user.public_id:
                    continue
                _backfill_customer_subscriptions(client, project_id, user.public_id, user, db, stats)
                if i % 25 == 0 or i == len(users):
                    print(f"progress: {i}/{len(users)} {stats}")

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
            gross = float(gross)

            starts_at = _ms_to_dt(sub.get("starts_at"))
            ends_at = _ms_to_dt(sub.get("ends_at") or sub.get("current_period_ends_at"))
            current_period_start = _ms_to_dt(sub.get("current_period_starts_at"))
            currency = revenue.get("currency") or "USD"
            store = (sub.get("store") or "").upper() or None
            status = sub.get("status")

            fraction = _estimate_current_period_share(sub)
            target_current = round(gross * fraction, 2) if (fraction and current_period_start) else 0.0
            target_historical = round(gross - target_current, 2)

            existing_rows = (
                db.query(SubscriptionEvent)
                .filter(
                    SubscriptionEvent.user_id == user.id,
                    SubscriptionEvent.event_type == HISTORICAL_EVENT_TYPE,
                    SubscriptionEvent.transaction_id == transaction_id,
                )
                .all()
            )
            recorded_total = round(sum(float(r.price_usd or 0) for r in existing_rows), 2)
            # Has a row already been dated within the *current* period? If the current
            # period rolled forward since we last recorded this (a new renewal), no
            # existing row will satisfy this, correctly forcing a re-split.
            recorded_current = round(
                sum(
                    float(r.price_usd or 0)
                    for r in existing_rows
                    if current_period_start and r.occurred_at and r.occurred_at >= current_period_start
                ),
                2,
            )

            unchanged = (
                existing_rows
                and abs(recorded_total - gross) < CENTS
                and abs(recorded_current - target_current) < CENTS
            )
            if unchanged:
                stats["skipped_no_change"] += 1
                continue

            for row in existing_rows:
                db.delete(row)

            def _add_row(amount: float, occurred_at, display_type: str) -> None:
                db.add(
                    SubscriptionEvent(
                        user_id=user.id,
                        subscription_id=None,
                        event_type=HISTORICAL_EVENT_TYPE,
                        plan="premium",
                        status=status,
                        started_at=starts_at,
                        expires_at=ends_at,
                        transaction_id=transaction_id,
                        original_transaction_id=transaction_id,
                        product_id=sub.get("product_id"),
                        store=store,
                        environment="PRODUCTION",
                        occurred_at=occurred_at,
                        price_usd=amount,
                        currency=currency,
                        display_type=display_type,
                    )
                )

            if target_historical > CENTS:
                _add_row(target_historical, starts_at or datetime.utcnow(), HISTORICAL_DISPLAY_TYPE)
            if target_current > CENTS:
                _add_row(target_current, current_period_start, CURRENT_PERIOD_DISPLAY_TYPE)

            db.commit()
            if existing_rows:
                stats["resplit"] += 1
            else:
                stats["inserted"] += 1

        subs_url = data.get("next_page")
        subs_params = {}


if __name__ == "__main__":
    main()
