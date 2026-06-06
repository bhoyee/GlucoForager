from datetime import date, datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from ..core.security import decode_access_token
from ..database import get_db
from ..models.user import User
from ..services.subscription_service import get_effective_subscription_tier
from ..services.trial_access_service import get_access_snapshot, trial_required_detail
from ..services.user_activity_service import touch_user_activity

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
    touch_user_activity(db, user)
    return user


def check_user_access(user: User, db: Session, device_id: str | None = None) -> dict:
    snapshot = get_access_snapshot(db, user)
    return {
        "allowed": snapshot.allowed,
        "searches_left": "unlimited" if snapshot.allowed else 0,
        "device_searches_left": "unlimited" if snapshot.allowed else 0,
        "daily_limit": None,
        "limit_window_days": None,
        "camera_access": snapshot.allowed,
        "ads": False,
        "has_feature_access": snapshot.allowed,
        "subscription_tier": "premium" if snapshot.is_premium else "free",
        "is_premium": snapshot.is_premium,
        "access_status": snapshot.access_status,
        "trial_active": snapshot.trial_active,
        "trial_ends_at": snapshot.trial_ends_at,
        "trial_grace_active": snapshot.trial_grace_active,
        "trial_grace_ends_at": snapshot.trial_grace_ends_at,
        "trial_days_left": snapshot.trial_days_left,
        "detail": None if snapshot.allowed else trial_required_detail(snapshot),
    }


def require_ai_feature_access(user: User, db: Session, device_id: str | None = None) -> dict:
    access = check_user_access(user, db, device_id)
    if access["allowed"]:
        return access
    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail=access.get("detail") or trial_required_detail(),
    )
