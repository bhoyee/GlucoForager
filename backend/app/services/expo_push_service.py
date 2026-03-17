from __future__ import annotations

from dataclasses import dataclass

import httpx

from ..core.config import settings


@dataclass
class ExpoPushResult:
    success_count: int
    failure_count: int
    failures: list[dict]


def _chunk(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def send_expo_push_messages(messages: list[dict], timeout_seconds: float = 15.0) -> ExpoPushResult:
    """
    Send messages via Expo push gateway.

    Each message should include at minimum: { "to": "<ExponentPushToken[...]>" , "title": "...", "body": "..." }
    """
    if not messages:
        return ExpoPushResult(success_count=0, failure_count=0, failures=[])

    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if settings.expo_push_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_push_access_token}"

    success = 0
    failure = 0
    failures: list[dict] = []

    with httpx.Client(timeout=timeout_seconds) as client:
        for batch in _chunk(messages, 100):
            try:
                response = client.post(settings.expo_push_endpoint, json=batch, headers=headers)
            except Exception as exc:  # noqa: BLE001
                failure += len(batch)
                failures.append({"error": f"Expo request failed: {exc}", "count": len(batch)})
                continue

            data = {}
            try:
                data = response.json()
            except Exception:  # noqa: BLE001
                data = {}

            tickets = data.get("data")
            if not response.ok or not isinstance(tickets, list):
                failure += len(batch)
                failures.append(
                    {
                        "error": data.get("errors") or data.get("message") or f"Expo push error HTTP {response.status_code}",
                        "count": len(batch),
                    }
                )
                continue

            for i, ticket in enumerate(tickets):
                if isinstance(ticket, dict) and ticket.get("status") == "ok":
                    success += 1
                    continue

                failure += 1
                failures.append(
                    {
                        "index": i,
                        "to": batch[i].get("to") if i < len(batch) else None,
                        "error": (ticket.get("message") if isinstance(ticket, dict) else None)
                        or "Expo ticket error",
                        "details": ticket.get("details") if isinstance(ticket, dict) else None,
                    }
                )

    return ExpoPushResult(success_count=success, failure_count=failure, failures=failures)

