from __future__ import annotations

import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from datetime import datetime, timezone

from .cache_service import CacheService
from .ai_swaps_service import AISwapsService
from .system_log_service import log_system_event

logger = logging.getLogger(__name__)


_pool = ThreadPoolExecutor(max_workers=2)
_lock = threading.Lock()
_inflight: set[str] = set()


def enqueue_swaps_ai_warmup(
    *,
    cache_key_ai: str,
    food: str,
    force_swaps: bool,
    food_profile: dict[str, Any] | None,
) -> None:
    """
    Best-effort async OpenAI warmup for swaps.

    Goal: keep the UX instant (fallback-first) while still generating an AI result that
    can be served from cache on the next request.

    Notes:
    - No DB writes here (avoid session/thread pitfalls).
    - Deduped by cache_key_ai to avoid stampedes.
    """
    key = (cache_key_ai or "").strip()
    if not key:
        return
    with _lock:
        if key in _inflight:
            return
        _inflight.add(key)

    def _run() -> None:
        try:
            service = AISwapsService()
            result = service.generate_swaps(
                food=food,
                force_swaps=bool(force_swaps),
                # Background warmup can wait longer since it doesn't block the request.
                timeout_seconds=25.0,
                food_profile=food_profile,
            )
            # Strip provider/model from app response.
            response_payload = {
                "food": result.get("food"),
                "message": None,
                "suggested_query": None,
                "swaps": result.get("swaps") if isinstance(result.get("swaps"), dict) else None,
            }
            CacheService().set(key, json.dumps(response_payload, ensure_ascii=False), ttl_seconds=6 * 60 * 60)
            log_system_event(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "level": "info",
                    "source": "swaps",
                    "message": "Swaps AI warmup cached",
                    "details": f"cache_key_ai={key} food={str(food)[:25]!r}",
                    "path": "/api/app/swaps",
                    "method": "WARMUP",
                    "ip": None,
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Swaps AI warmup failed: %s", str(exc)[:160])
            log_system_event(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "level": "warn",
                    "source": "swaps",
                    "message": "Swaps AI warmup failed",
                    "details": f"cache_key_ai={key} food={str(food)[:25]!r} err={exc.__class__.__name__}:{str(exc)[:160]}",
                    "path": "/api/app/swaps",
                    "method": "WARMUP",
                    "ip": None,
                }
            )
        finally:
            with _lock:
                _inflight.discard(key)

    try:
        _pool.submit(_run)
    except Exception:
        with _lock:
            _inflight.discard(key)
