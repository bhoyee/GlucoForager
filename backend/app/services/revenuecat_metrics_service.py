import json
import logging
from datetime import datetime, timezone

import httpx

from ..core.config import settings
from .cache_service import CacheService

logger = logging.getLogger("glucoforager.revenuecat_metrics")

_CACHE_KEY_OVERVIEW = "revenuecat:metrics:overview:v1"
_CACHE_TTL_SECONDS = 60


def _normalize_overview_payload(payload: dict) -> dict:
    metrics = {}
    for item in payload.get("metrics") or []:
        metric_id = item.get("id")
        if not metric_id:
            continue
        metrics[str(metric_id)] = item.get("value")
    return metrics


def get_overview_metrics(cache: CacheService) -> dict:
    """
    Returns RevenueCat overview metrics.

    Notes:
    - RevenueCat "overview" metrics are a snapshot (e.g. revenue is typically last 28 days),
      not necessarily calendar-month or all-time values.
    - Cached server-side to avoid rate limiting.
    """
    if not settings.revenuecat_secret_api_key or not settings.revenuecat_project_id:
        return {
            "available": False,
            "message": "RevenueCat metrics are not configured.",
            "metrics": {},
            "currency": settings.revenuecat_currency,
        }

    cached = cache.get(_CACHE_KEY_OVERVIEW)
    if cached:
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            pass

    url = f"https://api.revenuecat.com/v2/projects/{settings.revenuecat_project_id}/metrics/overview"
    headers = {"Authorization": f"Bearer {settings.revenuecat_secret_api_key}"}

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, headers=headers)
        if response.status_code in {401, 403}:
            logger.warning("RevenueCat metrics auth failed (%s)", response.status_code)
            data = {
                "available": False,
                "message": "RevenueCat metrics request is not authorized. Check API key permissions.",
                "metrics": {},
                "currency": settings.revenuecat_currency,
            }
            cache.set(_CACHE_KEY_OVERVIEW, json.dumps(data), ttl_seconds=_CACHE_TTL_SECONDS)
            return data

        if response.status_code >= 400:
            logger.warning("RevenueCat metrics failed (%s): %s", response.status_code, response.text[:200])
            data = {
                "available": False,
                "message": "RevenueCat metrics request failed.",
                "metrics": {},
                "currency": settings.revenuecat_currency,
            }
            cache.set(_CACHE_KEY_OVERVIEW, json.dumps(data), ttl_seconds=_CACHE_TTL_SECONDS)
            return data

        payload = response.json()
        data = {
            "available": True,
            "metrics": _normalize_overview_payload(payload),
            "currency": settings.revenuecat_currency,
            "fetched_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        cache.set(_CACHE_KEY_OVERVIEW, json.dumps(data), ttl_seconds=_CACHE_TTL_SECONDS)
        return data
    except Exception as exc:  # noqa: BLE001
        logger.exception("RevenueCat metrics request failed: %s", exc)
        data = {
            "available": False,
            "message": "RevenueCat metrics request failed.",
            "metrics": {},
            "currency": settings.revenuecat_currency,
        }
        cache.set(_CACHE_KEY_OVERVIEW, json.dumps(data), ttl_seconds=_CACHE_TTL_SECONDS)
        return data

