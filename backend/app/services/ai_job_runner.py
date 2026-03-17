from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..core.config import settings
from ..database import SessionLocal
from ..models.ai_job import AIJob

logger = logging.getLogger(__name__)


class AIJobRunner:
    """
    Lightweight in-process job runner for AIJob rows.

    Why:
    - BackgroundTasks run inside the API process and can overwhelm the server under bursts.
    - This runner pulls jobs from the DB at a controlled rate and executes them with bounded
      worker pools (text vs vision).

    Notes:
    - This is not a full distributed queue. For large scale you should move to Redis queue/workers,
      but this is a safe upgrade that works locally and in simple deployments.
    - For multi-process deployments, we use SELECT ... FOR UPDATE SKIP LOCKED to prevent duplicates.
    """

    def __init__(self) -> None:
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._text_pool = ThreadPoolExecutor(max_workers=max(1, int(settings.ai_job_runner_text_workers)))
        self._vision_pool = ThreadPoolExecutor(max_workers=max(1, int(settings.ai_job_runner_vision_workers)))

        self._running_text = 0
        self._running_vision = 0
        self._lock = threading.Lock()

    def start(self) -> None:
        if not settings.ai_job_runner_enabled:
            logger.info("AI job runner disabled (AI_JOB_RUNNER_ENABLED=false).")
            return
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, name="ai-job-runner", daemon=True)
        self._thread.start()
        logger.info(
            "AI job runner started poll=%.2fs text_workers=%s vision_workers=%s",
            float(settings.ai_job_runner_poll_seconds),
            int(settings.ai_job_runner_text_workers),
            int(settings.ai_job_runner_vision_workers),
        )

    def stop(self) -> None:
        self._stop_event.set()

    def _loop(self) -> None:
        poll = max(0.2, float(settings.ai_job_runner_poll_seconds))
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception as exc:  # noqa: BLE001
                logger.warning("AI job runner tick failed: %s", str(exc)[:200])
            time.sleep(poll)

    def _tick(self) -> None:
        with self._lock:
            capacity_text = max(0, int(settings.ai_job_runner_text_workers) - self._running_text)
            capacity_vision = max(0, int(settings.ai_job_runner_vision_workers) - self._running_vision)

        if capacity_text <= 0 and capacity_vision <= 0:
            return

        db = SessionLocal()
        try:
            # Requeue stale jobs (e.g. worker crash) so they don't get stuck forever.
            self._requeue_stale(db)
            if capacity_text > 0:
                jobs = self._claim_jobs(db, source="text", limit=capacity_text)
                for job in jobs:
                    self._submit(job.id, source="text")

            if capacity_vision > 0:
                # vision + vision_batch share the same pool
                jobs = self._claim_jobs(db, source="vision", limit=capacity_vision)
                for job in jobs:
                    self._submit(job.id, source="vision")
        finally:
            db.close()

    def _requeue_stale(self, db: Session) -> None:
        try:
            cutoff = datetime.utcnow() - timedelta(minutes=10)
            stuck = (
                db.query(AIJob)
                .filter(AIJob.status == "queued", AIJob.updated_at < cutoff)
                .limit(200)
                .all()
            )
            if not stuck:
                return
            for job in stuck:
                job.status = "pending"
            db.commit()
        except Exception:
            # Best-effort; never crash the runner.
            db.rollback()

    def _claim_jobs(self, db: Session, *, source: str, limit: int) -> list[AIJob]:
        if limit <= 0:
            return []

        sources = [source]
        if source == "vision":
            sources = ["vision", "vision_batch"]

        rows = (
            db.query(AIJob)
            .filter(AIJob.status == "pending", AIJob.source.in_(sources))
            .order_by(AIJob.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(int(limit))
            .all()
        )
        if not rows:
            return []
        for row in rows:
            row.status = "queued"
        db.commit()
        return rows

    def _submit(self, job_id: str, *, source: str) -> None:
        with self._lock:
            if source == "text":
                self._running_text += 1
            else:
                self._running_vision += 1

        def _done_callback(_future) -> None:
            with self._lock:
                if source == "text":
                    self._running_text = max(0, self._running_text - 1)
                else:
                    self._running_vision = max(0, self._running_vision - 1)

        if source == "text":
            fut = self._text_pool.submit(self._run_text, job_id)
        else:
            fut = self._vision_pool.submit(self._run_vision, job_id)
        fut.add_done_callback(_done_callback)

    @staticmethod
    def _run_text(job_id: str) -> None:
        # Import inside the worker to avoid import cycles at startup.
        from ..api.endpoints.text_recipes import _run_text_job

        _run_text_job(job_id)

    @staticmethod
    def _run_vision(job_id: str) -> None:
        from ..api.endpoints.ai_recipes import _run_vision_job

        _run_vision_job(job_id)


runner = AIJobRunner()
