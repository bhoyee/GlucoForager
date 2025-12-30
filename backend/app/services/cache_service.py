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
        redis_url = getattr(settings, "redis_url", None)
        if redis_url:
            try:
                self.client = redis.from_url(redis_url)
                self.client.ping()
                logger.info("Redis cache connected")
            except Exception as exc:  # noqa: BLE001
                logger.warning("Redis unavailable, using in-memory cache: %s", exc)
                self.client = None
        self.memory_cache: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any:
        if self.client:
            try:
                value = self.client.get(key)
                if value is None:
                    return None
                return value.decode("utf-8")
            except Exception as exc:  # noqa: BLE001
                logger.warning("Redis get failed: %s", exc)
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
        self.memory_cache[key] = (time.time() + ttl_seconds, value)
