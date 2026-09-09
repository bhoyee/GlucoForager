"""Server-side PostHog events - for things the client can't reliably capture on its
own (a webhook firing, a background job's outcome) or where capturing it server-side
is just more trustworthy than trusting every client build to fire the event. Mirrors
the mobile app's utils/analytics.js: same Project API Key, same "never break the
thing it's measuring" rule - every call here is best-effort and swallows its own
errors.
"""

from __future__ import annotations

import logging

from posthog import Posthog

from ..core.config import settings

logger = logging.getLogger(__name__)

_client: Posthog | None = None
if settings.posthog_api_key:
    _client = Posthog(
        api_key=settings.posthog_api_key,
        host=settings.posthog_host or "https://us.i.posthog.com",
    )


def track_event(distinct_id: str | int | None, event: str, properties: dict | None = None) -> None:
    if not _client or not distinct_id:
        return
    try:
        _client.capture(distinct_id=str(distinct_id), event=event, properties=properties or {})
    except Exception:
        logger.exception("PostHog capture failed for event=%s", event)
