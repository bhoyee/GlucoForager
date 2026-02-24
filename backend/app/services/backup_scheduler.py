from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .backup_service import acquire_lock, create_backup, prune_old_backups, release_lock

logger = logging.getLogger(__name__)

_SCHEDULER: BackgroundScheduler | None = None


def start_backup_scheduler() -> None:
    global _SCHEDULER  # noqa: PLW0603
    if _SCHEDULER is not None:
        return

    enabled = (os.getenv("BACKUP_SCHEDULER_ENABLED", "1") or "1").strip().lower()
    if enabled in {"0", "false", "no"}:
        logger.info("Backup scheduler disabled by env")
        return

    hour = int(os.getenv("BACKUP_CRON_HOUR", "2") or "2")
    minute = int(os.getenv("BACKUP_CRON_MINUTE", "0") or "0")
    tz = os.getenv("BACKUP_TIMEZONE", "UTC") or "UTC"

    scheduler = BackgroundScheduler(timezone=tz)

    def run_backup_job() -> None:
        if not acquire_lock(ttl_seconds=60 * 60 * 3):
            logger.warning("Backup already running, skipping scheduled run")
            return
        try:
            info = create_backup()
            prune = prune_old_backups()
            logger.info(
                "Database backup created: %s (%d bytes). Pruned: %s",
                info.filename,
                info.size_bytes,
                prune,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Scheduled backup failed: %s", exc)
        finally:
            release_lock()

    scheduler.add_job(
        run_backup_job,
        CronTrigger(hour=hour, minute=minute),
        id="daily_db_backup",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=60 * 60,
    )

    scheduler.start()
    _SCHEDULER = scheduler
    logger.info(
        "Backup scheduler started (tz=%s) daily at %02d:%02d. (%s)",
        tz,
        hour,
        minute,
        datetime.now(timezone.utc).isoformat(),
    )

