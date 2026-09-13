from __future__ import annotations

import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..database import SessionLocal
from ..models.dunning_email_log import DunningEmailLog
from ..models.dunning_email_template import DunningEmailTemplate
from ..models.glucose_reading import GlucoseReading
from ..models.meal_log_entry import MealLogEntry
from ..models.recipe_history import RecipeHistory
from ..models.subscription import Subscription
from ..models.user import User
from .email_service import send_dunning_template_email
from .subscription_service import is_premium_blocked
from .trial_access_service import build_access_snapshot

logger = logging.getLogger(__name__)
_SCHEDULER: BackgroundScheduler | None = None

# Stage sent for each dunning_emails_sent count (0 = about to send the 1st email).
# Weekly for the first 4 sends (day 0/7/14/21), then monthly forever after.
WEEKLY_STAGES = ["day0", "day7", "day14", "day21"]
MONTHLY_INTERVAL_DAYS = 30

# How far back to look for the day0 "here's what you actually did" summary - a
# genuine usage recap is a much stronger reason to come back than a repeated
# feature list, since it's proof about that specific person, not marketing copy.
USAGE_SUMMARY_WINDOW_DAYS = 30


def _build_usage_summary(db, user_id: int, now: datetime) -> str:
    since = now - timedelta(days=USAGE_SUMMARY_WINDOW_DAYS)

    recipe_histories = (
        db.query(RecipeHistory).filter(RecipeHistory.user_id == user_id, RecipeHistory.created_at >= since).all()
    )
    recipes_generated = sum(len(row.recipes or []) for row in recipe_histories)
    meals_logged = (
        db.query(MealLogEntry).filter(MealLogEntry.user_id == user_id, MealLogEntry.logged_at >= since).count()
    )
    readings_logged = (
        db.query(GlucoseReading).filter(GlucoseReading.user_id == user_id, GlucoseReading.logged_at >= since).count()
    )

    def _plural(n: int, noun: str) -> str:
        return f"{n} {noun}{'' if n == 1 else 's'}"

    parts = []
    if recipes_generated:
        parts.append(f"generated {_plural(recipes_generated, 'recipe')}")
    if meals_logged:
        parts.append(f"logged {_plural(meals_logged, 'meal')}")
    if readings_logged:
        parts.append(f"tracked {_plural(readings_logged, 'glucose reading')}")

    if not parts:
        return "You gave GlucoForager a try recently"
    if len(parts) == 1:
        joined = parts[0]
    elif len(parts) == 2:
        joined = f"{parts[0]} and {parts[1]}"
    else:
        joined = f"{', '.join(parts[:-1])}, and {parts[-1]}"
    return f"You {joined} recently"

# Fallback only, in case a template row is ever missing (e.g. the migration's seed
# was deleted) - the real, editable copy lives in dunning_email_templates and is
# managed via /admin/win-back/templates.
FALLBACK_TEMPLATES = {
    "day0": {
        "subject": "Ready to have it all back?",
        "heading": "Here's the progress you'd be picking back up",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">{{usage_summary}} - that's real progress, and we'd love to help "
            "you keep it going.</p>"
            "<p style=\"line-height:1.6;\">Resubscribing brings back GlucoGuide AI, your Daily Meal Planner, "
            "recipe generation, and unlimited photo &amp; ingredient scanning - right where you left off.</p>"
            "<p style=\"line-height:1.6;\">Your barcode scans, food swaps, and glucose/carb tracking never "
            "stopped - they're still free and still yours.</p>"
            "<p style=\"line-height:1.6;\">One tap brings the rest back. We'd love to see you again.</p>"
        ),
    },
    "day7": {
        "subject": "Quick question before you go",
        "heading": "What made Premium not worth it right now?",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">You've been on the free plan a week now, and we're genuinely "
            "curious - was it the price, a bug, a missing feature, or just bad timing? Hit reply and tell us; "
            "we read every message.</p>"
            "<p style=\"line-height:1.6;\">And if you just haven't gotten around to it, resubscribing takes "
            "one tap whenever you're ready.</p>"
        ),
    },
    "day14": {
        "subject": "Have you tried asking GlucoGuide yet?",
        "heading": "The one Premium feature people miss trying",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">A lot of people don't get to try GlucoGuide AI during a short "
            "trial - it's built to answer real food questions on the spot, personalized to your profile, the "
            "moment you're unsure what to eat.</p>"
            "<p style=\"line-height:1.6;\">It comes right back with your Daily Meal Planner and recipe "
            "generation when you resubscribe.</p>"
            "<p style=\"line-height:1.6;\">Your barcode scans, food swaps, and glucose/carb tracking are "
            "still free in the meantime.</p>"
        ),
    },
    "day21": {
        "subject": "Last note for a while",
        "heading": "No pressure, no lock-in",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">This is the last weekly note from us - after this we'll only reach "
            "out occasionally.</p>"
            "<p style=\"line-height:1.6;\">If price or commitment was the hesitation: you can resubscribe and "
            "cancel anytime, no long-term lock-in either way.</p>"
            "<p style=\"line-height:1.6;\">If you want back in, we're one tap away.</p>"
        ),
    },
    "monthly": {
        "subject": "Still here when you're ready",
        "heading": "No rush - we're not going anywhere",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">Just a low-key reminder that GlucoGuide AI, your Daily Meal "
            "Planner, and full scanning are still here whenever you want them back. No pressure.</p>"
        ),
    },
}


def _batch_subscriptions(db, user_ids: list[int]) -> tuple[dict[int, Subscription], dict[int, Subscription]]:
    if not user_ids:
        return {}, {}
    subs = (
        db.query(Subscription)
        .filter(Subscription.user_id.in_(user_ids))
        .order_by(Subscription.user_id, Subscription.started_at.desc())
        .all()
    )
    latest_billing: dict[int, Subscription] = {}
    latest_comp: dict[int, Subscription] = {}
    for sub in subs:
        if sub.user_id not in latest_billing and sub.store is not None and sub.store != "admin":
            latest_billing[sub.user_id] = sub
        if sub.user_id not in latest_comp and sub.store == "admin" and sub.plan == "premium":
            latest_comp[sub.user_id] = sub
    return latest_billing, latest_comp


def _due_stage(user: User, now: datetime) -> str | None:
    emails_sent = user.dunning_emails_sent or 0

    if emails_sent < len(WEEKLY_STAGES):
        if not user.dunning_started_at:
            return WEEKLY_STAGES[0]
        elapsed_days = (now - user.dunning_started_at).days
        if elapsed_days >= emails_sent * 7:
            return WEEKLY_STAGES[emails_sent]
        return None

    last_sent = user.last_dunning_email_at or user.dunning_started_at
    if not last_sent or (now - last_sent).days >= MONTHLY_INTERVAL_DAYS:
        return "monthly"
    return None


def run_dunning_job() -> dict:
    now = datetime.utcnow()
    db = SessionLocal()
    sent_counts: dict[str, int] = {}
    try:
        candidates = (
            db.query(User)
            .filter(
                User.subscription_tier == "free",
                User.deleted_at.is_(None),
                User.suspended_at.is_(None),
                User.dunning_opt_out.is_(False),
            )
            .all()
        )
        if not candidates:
            return sent_counts

        # Loaded once per run, not per user - templates rarely change mid-run and
        # this avoids a DB round trip per candidate.
        templates = {row.stage: row for row in db.query(DunningEmailTemplate).all()}

        latest_billing, latest_comp = _batch_subscriptions(db, [u.id for u in candidates])

        for user in candidates:
            billing = latest_billing.get(user.id)
            comp = latest_comp.get(user.id)
            if billing is None and comp is None:
                # Never started a trial or purchase - nothing to win back.
                continue
            if is_premium_blocked(user, now=now):
                continue

            snapshot = build_access_snapshot(user, billing, comp, now=now)
            if snapshot.allowed or snapshot.access_status != "expired":
                # Regained access (or on legacy grace) - clear any in-progress sequence
                # so a future lapse starts a fresh one.
                if user.dunning_started_at or user.dunning_emails_sent:
                    user.dunning_started_at = None
                    user.dunning_emails_sent = 0
                    user.last_dunning_email_at = None
                    db.add(user)
                continue

            stage = _due_stage(user, now)
            if not stage:
                continue

            template = templates.get(stage)
            if template:
                subject, heading, body_html = template.subject, template.heading, template.body_html
            else:
                fallback = FALLBACK_TEMPLATES[stage]
                subject, heading, body_html = fallback["subject"], fallback["heading"], fallback["body_html"]
                logger.warning("No DunningEmailTemplate row for stage=%s, using fallback copy", stage)

            # Only day0 currently uses {{usage_summary}} - computed just-in-time,
            # not for every stage, to avoid 3 extra queries per candidate that
            # never gets used.
            placeholders = {}
            if stage == "day0":
                placeholders["usage_summary"] = _build_usage_summary(db, user.id, now)

            try:
                resend_email_id = send_dunning_template_email(
                    user.email,
                    user.full_name,
                    user.id,
                    subject=subject,
                    heading=heading,
                    body_html=body_html,
                    placeholders=placeholders,
                )
            except Exception:
                logger.exception("Failed to send dunning email user_id=%s stage=%s", user.id, stage)
                continue

            if stage == "day0":
                user.dunning_started_at = now
            user.dunning_emails_sent = (user.dunning_emails_sent or 0) + 1
            user.last_dunning_email_at = now
            db.add(user)
            db.add(
                DunningEmailLog(
                    user_id=user.id,
                    email=user.email,
                    stage=stage,
                    subject=subject,
                    sent_at=now,
                    resend_email_id=resend_email_id,
                )
            )
            sent_counts[stage] = sent_counts.get(stage, 0) + 1

        db.commit()
        if sent_counts:
            logger.info("Dunning job sent: %s", sent_counts)
        return sent_counts
    except Exception:
        db.rollback()
        logger.exception("Dunning job failed")
        return sent_counts
    finally:
        db.close()


def start_dunning_scheduler() -> None:
    global _SCHEDULER
    if _SCHEDULER:
        return

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        run_dunning_job,
        CronTrigger(hour=15, minute=0),
        id="dunning_emails",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _SCHEDULER = scheduler
    logger.info("Dunning email scheduler started")
