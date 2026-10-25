from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..core.config import settings
from .blog_autopilot import run_draft_day_job, run_weekly_plan_job

logger = logging.getLogger(__name__)
_SCHEDULER: BackgroundScheduler | None = None


def start_blog_autopilot_scheduler() -> None:
    """Sunday 8pm UK: research + plan the week. Mon/Wed/Fri 6am UK: write that day's draft."""
    global _SCHEDULER
    if _SCHEDULER or not settings.blog_autopilot_enabled:
        return

    scheduler = BackgroundScheduler(timezone="Europe/London")
    scheduler.add_job(
        run_weekly_plan_job,
        CronTrigger(day_of_week="sun", hour=20, minute=0),
        id="blog_autopilot_plan",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3 * 3600,
    )
    scheduler.add_job(
        run_draft_day_job,
        CronTrigger(day_of_week="mon,wed,fri", hour=6, minute=0),
        id="blog_autopilot_draft",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=6 * 3600,
    )
    scheduler.start()
    _SCHEDULER = scheduler
    logger.info("Blog autopilot scheduler started")
