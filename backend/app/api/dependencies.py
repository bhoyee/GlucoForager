from datetime import date, datetime, time, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from ..core.constants import FREE_SEARCH_LIMIT, TIER_CONFIG
from ..core.security import decode_access_token
from ..database import get_db
from ..models.ai_request import AIRequest
from ..models.user import SearchLog, User
from ..services.settings_service import get_scan_limit_settings
from ..services.subscription_service import get_effective_subscription_tier

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = decode_access_token(token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.suspended_at:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account locked. Contact support: hello@glucoforager.com",
        )
    return user


def check_user_access(user: User, db: Session, device_id: str | None = None) -> dict:
    effective_tier = get_effective_subscription_tier(db, user)
    tier_cfg = TIER_CONFIG.get(effective_tier, TIER_CONFIG["free"])

    # Premium: unlimited scans
    if effective_tier == "premium":
        return {
            "allowed": True,
            "searches_left": "unlimited",
            "camera_access": True,
            "ads": False,
        }

    today = date.today()

    # Default behavior is free=3/day from constants, but allow Admin overrides via app_settings.
    scan_limits = get_scan_limit_settings(db)
    daily_limit = tier_cfg.get("max_daily_scans", FREE_SEARCH_LIMIT)
    window_days = 1
    if effective_tier == "free":
        daily_limit = scan_limits.free_count
        window_days = scan_limits.free_window_days

    ai_count = 0
    search_count = 0
    device_ai_count = 0
    device_search_count = 0
    tomorrow = date.fromordinal(today.toordinal() + 1)

    window_start_date = today - timedelta(days=max(0, int(window_days) - 1))
    window_start_dt = datetime.combine(window_start_date, time.min)
    window_end_dt = datetime.combine(tomorrow, time.min)

    if daily_limit:
        ai_count = (
            db.query(AIRequest)
            .filter(
                AIRequest.user_id == user.id,
                AIRequest.request_type.in_(["vision", "vision_batch", "text"]),
                AIRequest.created_at >= window_start_dt,
                AIRequest.created_at < window_end_dt,
            )
            .count()
        )
        search_count = (
            db.query(SearchLog)
            .filter(
                SearchLog.user_id == user.id,
                SearchLog.executed_at >= window_start_date,
                SearchLog.executed_at < tomorrow,
            )
            .count()
        )

        if device_id:
            device_ai_count = (
                db.query(AIRequest)
                .filter(
                    AIRequest.device_id == device_id,
                    AIRequest.request_type.in_(["vision", "vision_batch", "text"]),
                    AIRequest.created_at >= window_start_dt,
                    AIRequest.created_at < window_end_dt,
                )
                .count()
            )
            device_search_count = (
                db.query(SearchLog)
                .filter(
                    SearchLog.device_id == device_id,
                    SearchLog.executed_at >= window_start_date,
                    SearchLog.executed_at < tomorrow,
                )
                .count()
            )

    total_used = ai_count + search_count
    device_used = device_ai_count + device_search_count if device_id else 0
    device_allowed = True if not device_id else (device_used < daily_limit)
    user_left = max(0, daily_limit - total_used) if daily_limit is not None else None
    device_left = max(0, daily_limit - device_used) if (daily_limit is not None and device_id) else None
    effective_left = (
        min(user_left, device_left)
        if user_left is not None and device_left is not None
        else user_left if user_left is not None
        else "unlimited"
    )
    return {
        "allowed": (total_used < daily_limit and device_allowed) if daily_limit is not None else True,
        "searches_left": effective_left,
        "device_searches_left": None
        if daily_limit is None or not device_id
        else max(0, daily_limit - device_used),
        "daily_limit": daily_limit,
        "limit_window_days": int(window_days),
        "camera_access": False,
        "ads": True,
    }
