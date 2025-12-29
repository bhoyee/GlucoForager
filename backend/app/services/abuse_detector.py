from collections import defaultdict
from datetime import datetime, timedelta
from typing import DefaultDict


class AbuseDetector:
    """Lightweight in-memory abuse detector. Replace with Redis or database for production."""

    def __init__(self, max_requests_per_minute: int = 60) -> None:
        self.max_requests_per_minute = max_requests_per_minute
        self.user_hits: DefaultDict[str, list[datetime]] = defaultdict(list)

    def record_and_check(self, user_identifier: str) -> bool:
        now = datetime.utcnow()
        window_start = now - timedelta(minutes=1)
        hits = [ts for ts in self.user_hits[user_identifier] if ts >= window_start]
        hits.append(now)
        self.user_hits[user_identifier] = hits
        return len(hits) <= self.max_requests_per_minute

    def reset(self, user_identifier: str) -> None:
        self.user_hits.pop(user_identifier, None)
