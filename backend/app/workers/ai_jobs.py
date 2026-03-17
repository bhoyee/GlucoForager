from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor

from ..core.config import settings
from ..services.redis_ai_queue import RedisAIQueue

logger = logging.getLogger(__name__)


def _run_text(job_id: str) -> None:
    from ..api.endpoints.text_recipes import _run_text_job

    _run_text_job(job_id)


def _run_vision(job_id: str) -> None:
    from ..api.endpoints.ai_recipes import _run_vision_job

    _run_vision_job(job_id)


def main() -> None:
    queue = RedisAIQueue.from_settings()
    if not queue:
        raise RuntimeError("Redis AI queue not configured. Set REDIS_URL and AI_QUEUE_BACKEND=redis.")

    text_pool = ThreadPoolExecutor(max_workers=max(1, int(settings.ai_job_runner_text_workers)))
    vision_pool = ThreadPoolExecutor(max_workers=max(1, int(settings.ai_job_runner_vision_workers)))

    stream_text = queue.cfg.stream_text
    stream_vision = queue.cfg.stream_vision

    logger.info(
        "AI worker started backend=redis group=%s consumer=%s text_workers=%s vision_workers=%s",
        queue.cfg.group,
        queue.consumer,
        int(settings.ai_job_runner_text_workers),
        int(settings.ai_job_runner_vision_workers),
    )

    last_reclaim = 0.0
    while True:
        # Periodically try to reclaim stuck pending messages (worker crash, etc.).
        now = time.time()
        if now - last_reclaim > 10:
            try:
                reclaimed = queue.maybe_reclaim_stuck()
                if reclaimed:
                    logger.info("AI worker reclaimed %s pending messages", reclaimed)
            except Exception:
                pass
            last_reclaim = now

        messages = queue.read(count=10)
        if not messages:
            continue
        for stream, message_id, job_id in messages:
            if stream == stream_text:
                text_pool.submit(_run_text, job_id)
            else:
                vision_pool.submit(_run_vision, job_id)
            # Ack immediately: the job status/result is tracked in the DB.
            # If a worker crashes mid-job, the job will remain in "pending"/"queued" and can be retried
            # by client re-enqueue or admin tools. (For stricter at-least-once, ack-after-run is possible
            # but needs per-message completion tracking.)
            try:
                queue.ack(stream, message_id)
            except Exception:
                pass


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
    main()

