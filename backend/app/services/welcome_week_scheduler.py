"""Welcome-week lifecycle emails: a reminder ~2 days before the no-card Premium week
ends, and a "here's what's still free" email when it ends.

Off unless WELCOME_WEEK_EMAILS_ENABLED=1, so deploying never emails anyone by itself.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..database import SessionLocal
from ..models.user import User
from .email_service import send_welcome_week_ended_email, send_welcome_week_reminder_email
from .settings_service import get_free_tier_settings
from .trial_access_service import get_access_snapshot

logger = logging.getLogger(__name__)
_SCHEDULER: BackgroundScheduler | None = None

REMINDER_DAYS_BEFORE_END = 2
# Only email users whose window ended recently - never the old free-era "legacy grace"
# users whose windows closed long ago.
ENDED_EMAIL_WINDOW = timedelta(days=3)


def emails_enabled() -> bool:
    return (os.getenv("WELCOME_WEEK_EMAILS_ENABLED", "0") or "0").strip().lower() in {"1", "true", "yes", "on"}


def run_welcome_week_job() -> dict:
    now = datetime.utcnow()
    sent = {"reminder": 0, "ended": 0}
    if not emails_enabled():
        return sent
    db = SessionLocal()
    try:
        candidates = (
            db.query(User)
            .filter(
                User.trial_grace_ends_at.is_not(None),
                User.trial_grace_ends_at > now - ENDED_EMAIL_WINDOW,
                User.deleted_at.is_(None),
                User.suspended_at.is_(None),
                User.dunning_opt_out.is_(False),
            )
            .all()
        )
        for user in candidates:
            end = user.trial_grace_ends_at
            snapshot = get_access_snapshot(db, user)
            if snapshot.is_premium:
                # Already upgraded (store trial, subscription or comp) - nothing to nudge.
                continue
            try:
                if end > now:
                    if user.welcome_reminder_email_at is None and end - now <= timedelta(days=REMINDER_DAYS_BEFORE_END):
                        days_left = max(1, int(((end - now).total_seconds() + 86399) // 86400))
                        send_welcome_week_reminder_email(user.email, user.full_name, user.id, days_left=days_left)
                        user.welcome_reminder_email_at = now
                        sent["reminder"] += 1
                elif user.welcome_ended_email_at is None:
                    send_welcome_week_ended_email(
                        user.email, user.full_name, user.id, weekly_limits=get_free_tier_settings(db).weekly_limits
                    )
                    user.welcome_ended_email_at = now
                    sent["ended"] += 1
                db.add(user)
                db.commit()
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                logger.warning("Welcome-week email failed for user_id=%s: %s", user.id, exc)
        if sent["reminder"] or sent["ended"]:
            logger.info("Welcome-week emails sent: %s", sent)
        return sent
    finally:
        db.close()


def start_welcome_week_scheduler() -> None:
    global _SCHEDULER
    if _SCHEDULER:
        return
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        run_welcome_week_job,
        CronTrigger(minute=20),  # hourly
        id="welcome_week_emails",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _SCHEDULER = scheduler
    logger.info("Welcome-week email scheduler started (enabled=%s)", emails_enabled())
