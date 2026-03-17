from __future__ import annotations

import logging
import os
import socket
from dataclasses import dataclass

import redis

from ..core.config import settings

logger = logging.getLogger(__name__)


def _consumer_name() -> str:
    host = socket.gethostname() or "host"
    pid = os.getpid()
    return f"{host}:{pid}"


@dataclass(frozen=True)
class RedisAIQueueConfig:
    url: str
    stream_text: str
    stream_vision: str
    group: str
    block_ms: int
    claim_idle_ms: int


class RedisAIQueue:
    """
    Redis Streams backed queue for AIJob IDs.

    We use consumer groups so:
    - messages are not lost if a worker crashes (they remain pending)
    - we can scale workers horizontally
    - we can reclaim "stuck" pending messages with XAUTOCLAIM
    """

    def __init__(self, cfg: RedisAIQueueConfig) -> None:
        self.cfg = cfg
        self.client = redis.from_url(
            cfg.url,
            socket_connect_timeout=1,
            socket_timeout=10,
            retry_on_timeout=True,
            decode_responses=True,
        )
        self.consumer = _consumer_name()

    @staticmethod
    def from_settings() -> "RedisAIQueue" | None:
        url = (settings.redis_url or "").strip()
        if not url:
            return None
        cfg = RedisAIQueueConfig(
            url=url,
            stream_text=str(settings.ai_queue_redis_stream_text),
            stream_vision=str(settings.ai_queue_redis_stream_vision),
            group=str(settings.ai_queue_redis_group),
            block_ms=int(settings.ai_queue_redis_block_ms),
            claim_idle_ms=int(settings.ai_queue_redis_claim_idle_ms),
        )
        try:
            q = RedisAIQueue(cfg)
            q._ensure_group(cfg.stream_text)
            q._ensure_group(cfg.stream_vision)
            return q
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis AI queue unavailable: %s", str(exc)[:200])
            return None

    def _ensure_group(self, stream: str) -> None:
        try:
            # Create stream implicitly with MKSTREAM.
            self.client.xgroup_create(stream, self.cfg.group, id="0-0", mkstream=True)
        except redis.ResponseError as exc:
            # BUSYGROUP means it already exists.
            if "BUSYGROUP" not in str(exc):
                raise

    def enqueue_text(self, job_id: str) -> None:
        self.client.xadd(self.cfg.stream_text, {"job_id": job_id})

    def enqueue_vision(self, job_id: str) -> None:
        self.client.xadd(self.cfg.stream_vision, {"job_id": job_id})

    def read(self, *, count: int = 10) -> list[tuple[str, str, str]]:
        """
        Read messages from both streams.

        Returns tuples: (stream, message_id, job_id)
        """
        res = self.client.xreadgroup(
            groupname=self.cfg.group,
            consumername=self.consumer,
            streams={
                self.cfg.stream_text: ">",
                self.cfg.stream_vision: ">",
            },
            count=int(count),
            block=int(self.cfg.block_ms),
        )
        out: list[tuple[str, str, str]] = []
        for stream, messages in res or []:
            for message_id, fields in messages:
                job_id = (fields or {}).get("job_id")
                if isinstance(job_id, str) and job_id.strip():
                    out.append((stream, message_id, job_id.strip()))
        return out

    def ack(self, stream: str, message_id: str) -> None:
        self.client.xack(stream, self.cfg.group, message_id)

    def maybe_reclaim_stuck(self, *, limit: int = 50) -> int:
        """
        Best-effort: reclaim pending messages that have been idle too long.

        Uses XAUTOCLAIM when supported (Redis 6.2+). Returns number of messages reclaimed.
        """
        reclaimed = 0
        for stream in (self.cfg.stream_text, self.cfg.stream_vision):
            try:
                # Start at "0-0" each tick; XAUTOCLAIM returns next start id.
                next_start, messages = self.client.xautoclaim(
                    name=stream,
                    groupname=self.cfg.group,
                    consumername=self.consumer,
                    min_idle_time=int(self.cfg.claim_idle_ms),
                    start_id="0-0",
                    count=int(limit),
                )
                _ = next_start
                reclaimed += len(messages or [])
            except Exception:
                # Older Redis or permissions; ignore.
                continue
        return reclaimed

