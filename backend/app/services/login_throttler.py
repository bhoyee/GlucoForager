from collections import defaultdict
from datetime import datetime, timedelta
from typing import DefaultDict

from ..core.constants import LOGIN_LOCKOUT_SECONDS, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS


class LoginThrottler:
    """In-memory login throttler. Replace with Redis for multi-instance deployments."""

    def __init__(
        self,
        max_attempts: int = LOGIN_MAX_ATTEMPTS,
        window_seconds: int = LOGIN_WINDOW_SECONDS,
        lockout_seconds: int = LOGIN_LOCKOUT_SECONDS,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self.failed_attempts: DefaultDict[str, list[datetime]] = defaultdict(list)
        self.lockouts: dict[str, datetime] = {}

    def check_allowed(self, identifier: str) -> tuple[bool, int]:
        """Return (allowed, seconds_remaining_if_locked)."""
        now = datetime.utcnow()
        if identifier in self.lockouts:
            until = self.lockouts[identifier]
            if until > now:
                remaining = int((until - now).total_seconds())
                return False, remaining
            # Lockout expired
            self.lockouts.pop(identifier, None)
            self.failed_attempts.pop(identifier, None)
        return True, 0

    def record_failure(self, identifier: str) -> int:
        """Record a failure; return remaining attempts before lockout."""
        now = datetime.utcnow()
        window_start = now - timedelta(seconds=self.window_seconds)
        attempts = [ts for ts in self.failed_attempts[identifier] if ts >= window_start]
        attempts.append(now)
        self.failed_attempts[identifier] = attempts
        if len(attempts) >= self.max_attempts:
            self.lockouts[identifier] = now + timedelta(seconds=self.lockout_seconds)
            return 0
        return max(0, self.max_attempts - len(attempts))

    def record_success(self, identifier: str) -> None:
        self.failed_attempts.pop(identifier, None)
        self.lockouts.pop(identifier, None)
