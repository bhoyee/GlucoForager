from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..database import SessionLocal
from .recipe_generation_service import (
    RecipeGenerationError,
    RecipeGenerationParams,
    generate_recipe_draft_batch,
)

logger = logging.getLogger(__name__)
_SCHEDULER: BackgroundScheduler | None = None

_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"]

# Rotate through the cuisine list day-by-day so the catalog broadens over time instead
# of every scheduled run generating the same defaults.
_CUISINE_ROTATION = [
    "west_african",
    "east_african",
    "mena",
    "british_irish",
    "american_canadian",
    "caribbean",
    "mediterranean",
    "south_asian",
    "east_asian",
    "southeast_asian",
    "latin_american",
    "european",
]


def _lock_path() -> Path:
    directory = Path(os.getenv("LOG_DIR", "logs"))
    directory.mkdir(parents=True, exist_ok=True)
    return directory / ".recipe_autogen.lock"


def _acquire_lock(ttl_seconds: int) -> bool:
    lock = _lock_path()
    now = time.time()
    try:
        if lock.exists():
            try:
                age = now - lock.stat().st_mtime
                if age > ttl_seconds:
                    lock.unlink(missing_ok=True)
            except OSError:
                pass
        fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(str(int(now)))
        return True
    except FileExistsError:
        return False


def _release_lock() -> None:
    try:
        _lock_path().unlink(missing_ok=True)
    except OSError:
        return


def _todays_cuisine() -> str:
    day_index = datetime.now(timezone.utc).toordinal()
    return _CUISINE_ROTATION[day_index % len(_CUISINE_ROTATION)]


def run_recipe_auto_generation() -> None:
    """Generate a small batch of AI recipe drafts per meal type, rotating cuisine focus
    day-to-day. Drafts are saved with status="draft" (no image, no auto-publish) - an
    admin later batch-adds images and bulk-publishes. Safe to call directly (e.g. for
    a manual/manual-trigger run) as well as from the scheduled job below.
    """
    if not _acquire_lock(ttl_seconds=60 * 30):
        logger.warning("Recipe auto-generation already running, skipping this run")
        return
    try:
        per_meal = int(os.getenv("RECIPE_AUTOGEN_PER_MEAL_TYPE", "2") or "2")
        cuisine = _todays_cuisine()
        db = SessionLocal()
        total_created = 0
        total_skipped_duplicates = 0
        errors: list[str] = []
        try:
            for meal_type in _MEAL_TYPES:
                params = RecipeGenerationParams(
                    count=per_meal,
                    meal_type=meal_type,
                    cuisine_tags=[cuisine],
                    notes=(
                        "Auto-generated daily catalog batch. Vary dietary pattern, goals, "
                        "and specific dishes across the recipes in this batch for internal variety."
                    ),
                )
                try:
                    result = generate_recipe_draft_batch(db, params, generated_by_admin_user_id=None)
                    total_created += result.get("created_count", 0)
                    total_skipped_duplicates += len(result.get("skipped_duplicates") or [])
                except RecipeGenerationError as exc:
                    errors.append(f"{meal_type}: {exc}")
        finally:
            db.close()
        logger.info(
            "Recipe auto-generation run complete: cuisine=%s created=%d skipped_duplicates=%d errors=%s",
            cuisine,
            total_created,
            total_skipped_duplicates,
            errors or "none",
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Scheduled recipe auto-generation failed: %s", exc)
    finally:
        _release_lock()


def start_recipe_auto_generation_scheduler() -> None:
    global _SCHEDULER  # noqa: PLW0603
    if _SCHEDULER is not None:
        return

    enabled = (os.getenv("RECIPE_AUTOGEN_ENABLED", "1") or "1").strip().lower()
    if enabled in {"0", "false", "no"}:
        logger.info("Recipe auto-generation scheduler disabled by env")
        return

    hour = int(os.getenv("RECIPE_AUTOGEN_CRON_HOUR", "4") or "4")
    minute = int(os.getenv("RECIPE_AUTOGEN_CRON_MINUTE", "0") or "0")
    tz = os.getenv("RECIPE_AUTOGEN_TIMEZONE", "UTC") or "UTC"
    per_meal = os.getenv("RECIPE_AUTOGEN_PER_MEAL_TYPE", "2")

    scheduler = BackgroundScheduler(timezone=tz)
    scheduler.add_job(
        run_recipe_auto_generation,
        CronTrigger(hour=hour, minute=minute),
        id="recipe_auto_generation",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=60 * 60,
    )
    scheduler.start()
    _SCHEDULER = scheduler
    logger.info(
        "Recipe auto-generation scheduler started (tz=%s) daily at %02d:%02d, %s per meal type.",
        tz,
        hour,
        minute,
        per_meal,
    )
