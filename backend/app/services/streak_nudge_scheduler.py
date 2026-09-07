from __future__ import annotations

import logging
from datetime import date, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..database import SessionLocal
from ..models.push_token import PushToken
from ..models.user import User
from ..models.user_daily_challenge import UserDailyChallenge
from .daily_challenge_service import get_streak_days
from .expo_push_service import send_expo_push_messages

logger = logging.getLogger(__name__)
_SCHEDULER: BackgroundScheduler | None = None


def run_streak_nudge_job() -> dict:
    """Nudges users with an active streak who haven't finished today's daily
    challenge yet, so the streak doesn't quietly reset overnight. Only users
    with a streak already in progress (as of yesterday) are eligible - this is
    a streak-protection nudge, not a general re-engagement push (that's the
    dunning email sequence's job)."""
    today = date.today()
    yesterday = today - timedelta(days=1)
    db = SessionLocal()
    try:
        candidates = (
            db.query(User)
            .join(PushToken, PushToken.user_id == User.id)
            .filter(
                User.deleted_at.is_(None),
                User.suspended_at.is_(None),
                PushToken.enabled.is_(True),
            )
            .distinct()
            .all()
        )
        if not candidates:
            return {"sent": 0, "eligible": 0}

        user_ids = [u.id for u in candidates]
        todays_rows = {
            row.user_id: row
            for row in db.query(UserDailyChallenge).filter(
                UserDailyChallenge.user_id.in_(user_ids),
                UserDailyChallenge.date == today,
            )
        }

        streak_by_user: dict[int, int] = {}
        for user in candidates:
            row = todays_rows.get(user.id)
            if row and row.completed_at is not None:
                continue  # already finished today - streak is safe
            streak = get_streak_days(db, user=user, up_to=yesterday)
            if streak > 0:
                streak_by_user[user.id] = streak

        if not streak_by_user:
            return {"sent": 0, "eligible": 0}

        tokens = (
            db.query(PushToken)
            .filter(PushToken.user_id.in_(list(streak_by_user.keys())), PushToken.enabled.is_(True))
            .all()
        )

        messages = []
        for t in tokens:
            streak = streak_by_user.get(t.user_id, 0)
            if streak <= 0:
                continue
            messages.append(
                {
                    "to": t.token,
                    "sound": "default",
                    "title": f"Your {streak}-day streak is at risk",
                    "body": "Finish today's challenge in GlucoForager before it resets.",
                    "data": {"deeplink": "Challenge"},
                }
            )

        result = send_expo_push_messages(messages)
        logger.info(
            "Streak nudge job: eligible=%s sent=%s failed=%s",
            len(streak_by_user),
            result.success_count,
            result.failure_count,
        )
        return {"sent": result.success_count, "eligible": len(streak_by_user)}
    except Exception:
        logger.exception("Streak nudge job failed")
        return {"sent": 0, "eligible": 0}
    finally:
        db.close()


def start_streak_nudge_scheduler() -> None:
    global _SCHEDULER
    if _SCHEDULER:
        return

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        run_streak_nudge_job,
        CronTrigger(hour=18, minute=30),
        id="streak_nudge",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _SCHEDULER = scheduler
    logger.info("Streak nudge scheduler started")
