from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from ..core.config import settings
from ..database import SessionLocal
from ..models.staff_assigned_task import StaffAssignedTask
from ..models.staff_notification import StaffNotification
from ..models.staff_user import StaffUser
from .email_service import send_staff_notification_email

logger = logging.getLogger(__name__)

_SCHEDULER: BackgroundScheduler | None = None


def _staff_portal_admin_base() -> str:
    base = (getattr(settings, "staff_portal_url", None) or "").strip().rstrip("/")
    if base:
        return base
    return f"{str(settings.site_url).strip().rstrip('/')}/admin"


def _work_log_link(work_date_iso: str) -> str:
    base = _staff_portal_admin_base().rstrip("/")
    return f"{base}/work-logs?date={work_date_iso}"


def _plain_text(v: str, *, max_len: int) -> str:
    s = str(v or "")
    if "<" in s and ">" in s:
        s = re.sub(r"<[^>]*>", " ", s)
        s = s.replace("&nbsp;", " ")
    s = " ".join(s.split())
    return s[: int(max_len)] if s else ""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _run_due_task_notifications() -> None:
    if not getattr(settings, "work_plans_scheduler_enabled", True):
        return

    now = _utc_now()
    batch_size = int(getattr(settings, "work_plans_scheduler_batch_size", 50))

    db = SessionLocal()
    emails: list[tuple[str, str, str]] = []
    try:
        # Only pick tasks that are scheduled and due, and haven't been notified yet.
        # Use SKIP LOCKED to avoid duplicate notifications if multiple app processes are running.
        due_tasks = (
            db.query(StaffAssignedTask)
            .filter(
                StaffAssignedTask.deleted_at.is_(None),
                StaffAssignedTask.show_at.is_not(None),
                StaffAssignedTask.show_at <= now,
                StaffAssignedTask.notified_at.is_(None),
            )
            .order_by(StaffAssignedTask.show_at.asc(), StaffAssignedTask.id.asc())
            .with_for_update(skip_locked=True)
            .limit(batch_size)
            .all()
        )

        if not due_tasks:
            return

        staff_by_id: dict[int, StaffUser] = {}
        for t in due_tasks:
            sid = int(t.staff_user_id)
            if sid not in staff_by_id:
                staff_by_id[sid] = db.query(StaffUser).filter(StaffUser.id == sid).first()

        for t in due_tasks:
            staff = staff_by_id.get(int(t.staff_user_id))
            if not staff or not staff.is_active or getattr(staff, "deleted_at", None) is not None:
                # Don't notify inactive/deleted accounts; mark as notified so we don't loop forever.
                t.notified_at = now
                continue

            work_date_iso = t.work_date.isoformat()
            db.add(
                StaffNotification(
                    staff_user_id=int(t.staff_user_id),
                    type="task.assigned",
                    title=f"New task for {work_date_iso}",
                    body=_plain_text(str(t.text or ""), max_len=240),
                    data={"task_id": int(t.id), "work_date": work_date_iso},
                    read_at=None,
                    created_at=datetime.utcnow(),
                )
            )
            t.notified_at = now

            try:
                emails.append(
                    (
                        str(staff.email),
                        f"New task for {work_date_iso}",
                        f"{str(t.text or '').strip()}\n\nOpen: {_work_log_link(work_date_iso)}",
                    )
                )
            except Exception:
                pass

        db.commit()
    except Exception:  # noqa: BLE001
        try:
            db.rollback()
        except Exception:
            pass
        logger.exception("Work plans scheduler: failed to process due tasks")
    finally:
        try:
            db.close()
        except Exception:
            pass

    # Send emails outside the DB transaction (best-effort).
    for to_email, title, body in emails:
        try:
            send_staff_notification_email(to_email=to_email, title=title, body=body)
        except Exception:
            pass


def start_work_plans_scheduler() -> None:
    global _SCHEDULER
    if not getattr(settings, "work_plans_scheduler_enabled", True):
        logger.info("Work plans scheduler disabled by env")
        return

    if _SCHEDULER and _SCHEDULER.running:
        return

    poll_seconds = float(getattr(settings, "work_plans_scheduler_poll_seconds", 30.0))
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        _run_due_task_notifications,
        IntervalTrigger(seconds=max(5.0, poll_seconds)),
        id="work_plans_due_tasks",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    scheduler.start()
    _SCHEDULER = scheduler
    logger.info("Work plans scheduler started (poll=%.1fs)", poll_seconds)

