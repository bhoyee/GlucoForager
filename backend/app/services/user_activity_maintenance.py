from __future__ import annotations

import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..database import SessionLocal
from ..models.user_activity_event import UserActivityEvent

logger = logging.getLogger(__name__)
_SCHEDULER: BackgroundScheduler | None = None
RETENTION_DAYS = 60


def cleanup_old_user_activity() -> int:
    cutoff = datetime.utcnow() - timedelta(days=RETENTION_DAYS)
    db = SessionLocal()
    try:
        deleted = (
            db.query(UserActivityEvent)
            .filter(UserActivityEvent.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        db.commit()
        if deleted:
            logger.info("User activity cleanup deleted %s rows older than %s days", deleted, RETENTION_DAYS)
        return int(deleted or 0)
    except Exception:
        db.rollback()
        logger.exception("User activity cleanup failed")
        return 0
    finally:
        db.close()


def start_user_activity_cleanup_scheduler() -> None:
    global _SCHEDULER
    if _SCHEDULER:
        return

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        cleanup_old_user_activity,
        CronTrigger(hour=3, minute=20),
        id="user_activity_cleanup",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _SCHEDULER = scheduler
    logger.info("User activity cleanup scheduler started (retention=%s days)", RETENTION_DAYS)
