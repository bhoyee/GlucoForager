"""One-off relaunch: give existing non-paying users a fresh 7-day welcome week and email them.

Dry run by default - prints who would be included and changes nothing:
    docker compose run --rm api python scripts/welcome_week_relaunch.py

Actually grant the week and send the emails (--limit N to send in batches; users already
granted are skipped on the next run because they're in their welcome week):
    docker compose run --rm api python scripts/welcome_week_relaunch.py --send [--limit 90]

Always excluded: users with Premium access (store trial/subscription, cancelled-but-active,
admin comp), deleted/suspended users, anyone who unsubscribed from lifecycle emails, anyone whose
welcome week ended in the last 30 days, and the addresses in EXCLUDED_EMAILS.
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.email_service import send_welcome_week_relaunch_email  # noqa: E402
from app.services.free_tier_service import start_welcome_week  # noqa: E402
from app.services.settings_service import get_free_tier_settings  # noqa: E402
from app.services.trial_access_service import get_access_snapshot  # noqa: E402

# Addresses to leave out. The three people who paid then cancelled were sent a personal
# "why did you cancel?" email on 2026-10-30 (free month if they reply) - no mixed messages.
EXCLUDED_EMAILS: set[str] = {
    "nathan.a.moore.1983@gmail.com",
    "missblair26@gmail.com",
    "aperez.lhc@yahoo.com",
}
# Someone whose welcome week ended this recently has just had one: don't give a second.
RECENT_WELCOME_WEEK_DAYS = 30


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--send", action="store_true", help="Grant the welcome week and send emails (default: dry run)")
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N users (e.g. to stay under a daily email quota)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        users = (
            db.query(User)
            .filter(User.deleted_at.is_(None), User.suspended_at.is_(None), User.dunning_opt_out.is_(False))
            .order_by(User.id)
            .all()
        )
        included = []
        skipped = {"excluded_email": 0, "has_premium": 0, "already_in_welcome_week": 0, "welcome_week_just_ended": 0}
        recent_cutoff = datetime.utcnow() - timedelta(days=RECENT_WELCOME_WEEK_DAYS)
        for user in users:
            if (user.email or "").strip().lower() in EXCLUDED_EMAILS:
                skipped["excluded_email"] += 1
                continue
            snapshot = get_access_snapshot(db, user)
            if snapshot.is_premium:
                skipped["has_premium"] += 1
                continue
            if snapshot.access_status == "legacy_grace":
                skipped["already_in_welcome_week"] += 1
                continue
            if user.trial_grace_ends_at and user.trial_grace_ends_at >= recent_cutoff:
                skipped["welcome_week_just_ended"] += 1
                continue
            included.append(user)

        if args.limit is not None:
            included = included[: args.limit]
        print(f"{'SENDING' if args.send else 'DRY RUN'}: {len(included)} users included; skipped {skipped}")
        for user in included:
            print(f"  {user.id:>5}  {user.email}")

        if not args.send:
            print("\nNothing changed. Re-run with --send to grant the welcome week and email these users.")
            return

        days = get_free_tier_settings(db).welcome_week_days
        sent = failed = 0
        for user in included:
            try:
                start_welcome_week(user, days=days)
                user.welcome_reminder_email_at = None
                user.welcome_ended_email_at = None
                db.add(user)
                db.commit()
                send_welcome_week_relaunch_email(user.email, user.full_name, user.id, welcome_days=days)
                sent += 1
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                failed += 1
                print(f"  FAILED {user.email}: {exc}")
            time.sleep(0.6)  # stay under Resend's rate limit
        print(f"\nDone: {sent} granted + emailed, {failed} failed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
