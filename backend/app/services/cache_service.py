import logging
import time
from typing import Any, Optional

import redis

from ..core.config import settings

logger = logging.getLogger(__name__)


class CacheService:
    """Redis-backed cache with in-memory fallback."""

    def __init__(self) -> None:
        self.client: Optional[redis.Redis] = None
        self.memory_cache: dict[str, tuple[float, Any]] = {}
        redis_url = getattr(settings, "redis_url", None)
        if redis_url:
            try:
                # Don't block app startup on Redis availability (common in local dev).
                # Connection will be attempted on first command; keep timeouts short.
                self.client = redis.from_url(
                    redis_url,
                    socket_connect_timeout=1,
                    socket_timeout=1,
                    retry_on_timeout=False,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Redis unavailable, using in-memory cache: %s", exc)
                self.client = None

    def get(self, key: str) -> Any:
        if self.client:
            try:
                value = self.client.get(key)
                if value is None:
                    return None
                return value.decode("utf-8")
            except Exception as exc:  # noqa: BLE001
                logger.warning("Redis get failed: %s", exc)
                self.client = None
        if key in self.memory_cache:
            expires, value = self.memory_cache[key]
            if expires >= time.time():
                return value
            self.memory_cache.pop(key, None)
        return None

    def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        if self.client:
            try:
                self.client.setex(key, ttl_seconds, value)
                return
            except Exception as exc:  # noqa: BLE001
                logger.warning("Redis set failed: %s", exc)
                self.client = None
        self.memory_cache[key] = (time.time() + ttl_seconds, value)

    def incr(self, key: str, ttl_seconds: int = 300) -> int:
        if self.client:
            try:
                pipeline = self.client.pipeline()
                pipeline.incr(key)
                pipeline.ttl(key)
                value, ttl = pipeline.execute()
                if ttl in (-1, -2):
                    self.client.expire(key, ttl_seconds)
                return int(value)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Redis incr failed: %s", exc)
                self.client = None

        current = 0
        if key in self.memory_cache:
            expires, stored = self.memory_cache[key]
            if expires >= time.time():
                try:
                    current = int(stored)
                except Exception:  # noqa: BLE001
                    current = 0
            else:
                self.memory_cache.pop(key, None)

        current += 1
        self.memory_cache[key] = (time.time() + ttl_seconds, current)
        return current
