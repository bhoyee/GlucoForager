from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models.admin_push_send import AdminPushSendFailure
from ..models.ai_job import AIJob
from ..models.ai_request import AIRequest
from ..models.favorite import Favorite
from ..models.meal_plan import MealPlan
from ..models.password_reset import PasswordResetToken
from ..models.push_token import PushToken
from ..models.recipe_history import RecipeHistory
from ..models.refresh_token import RefreshToken
from ..models.shopping_item import ShoppingItem
from ..models.subscription import Subscription
from ..models.user import SearchLog, User
from ..models.user_activity_event import UserActivityEvent
from ..models.user_daily_challenge import UserDailyChallenge

logger = logging.getLogger(__name__)
_SCHEDULER: BackgroundScheduler | None = None
DEFAULT_RETENTION_DAYS = 3


def deleted_user_retention_days() -> int:
    raw = (os.getenv("SOFT_DELETED_USER_RETENTION_DAYS", str(DEFAULT_RETENTION_DAYS)) or str(DEFAULT_RETENTION_DAYS)).strip()
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_RETENTION_DAYS
    return max(1, value)


def permanent_delete_at(user: User) -> datetime | None:
    if not getattr(user, "deleted_at", None):
        return None
    return user.deleted_at + timedelta(days=deleted_user_retention_days())


def hard_delete_user(db: Session, user: User) -> None:
    push_token_ids = [row[0] for row in db.query(PushToken.id).filter(PushToken.user_id == user.id).all()]
    push_failure_filter = AdminPushSendFailure.user_id == user.id
    if push_token_ids:
        push_failure_filter = or_(push_failure_filter, AdminPushSendFailure.push_token_id.in_(push_token_ids))

    db.query(AdminPushSendFailure).filter(push_failure_filter).delete(synchronize_session=False)
    db.query(PushToken).filter(PushToken.user_id == user.id).delete(synchronize_session=False)
    db.query(UserDailyChallenge).filter(UserDailyChallenge.user_id == user.id).delete(synchronize_session=False)
    db.query(AIJob).filter(AIJob.user_id == user.id).delete(synchronize_session=False)
    db.query(AIRequest).filter(AIRequest.user_id == user.id).delete(synchronize_session=False)
    db.query(Favorite).filter(Favorite.user_id == user.id).delete(synchronize_session=False)
    db.query(MealPlan).filter(MealPlan.user_id == user.id).delete(synchronize_session=False)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete(synchronize_session=False)
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).delete(synchronize_session=False)
    db.query(RecipeHistory).filter(RecipeHistory.user_id == user.id).delete(synchronize_session=False)
    db.query(ShoppingItem).filter(ShoppingItem.user_id == user.id).delete(synchronize_session=False)
    db.query(Subscription).filter(Subscription.user_id == user.id).delete(synchronize_session=False)
    db.query(SearchLog).filter(SearchLog.user_id == user.id).delete(synchronize_session=False)
    db.query(UserActivityEvent).filter(UserActivityEvent.user_id == user.id).delete(synchronize_session=False)
    db.delete(user)


def cleanup_expired_soft_deleted_users() -> int:
    retention_days = deleted_user_retention_days()
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    db = SessionLocal()
    try:
        users = (
            db.query(User)
            .filter(User.deleted_at.is_not(None), User.deleted_at <= cutoff)
            .order_by(User.deleted_at.asc(), User.id.asc())
            .limit(100)
            .all()
        )
        for user in users:
            hard_delete_user(db, user)
        db.commit()
        if users:
            logger.info("Permanently deleted %s soft-deleted users older than %s days", len(users), retention_days)
        return len(users)
    except Exception:
        db.rollback()
        logger.exception("Soft-deleted user cleanup failed")
        return 0
    finally:
        db.close()


def start_soft_deleted_user_cleanup_scheduler() -> None:
    global _SCHEDULER
    if _SCHEDULER:
        return

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        cleanup_expired_soft_deleted_users,
        CronTrigger(hour=3, minute=45),
        id="soft_deleted_user_cleanup",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _SCHEDULER = scheduler
    logger.info("Soft-deleted user cleanup scheduler started (retention=%s days)", deleted_user_retention_days())