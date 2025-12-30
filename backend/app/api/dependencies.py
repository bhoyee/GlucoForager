from datetime import date

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from ..core.constants import FREE_SEARCH_LIMIT, TIER_CONFIG
from ..core.security import decode_access_token
from ..database import get_db
from ..models.ai_request import AIRequest
from ..models.user import SearchLog, User

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
    return user


def check_user_access(user: User, db: Session) -> dict:
    tier_cfg = TIER_CONFIG.get(user.subscription_tier, TIER_CONFIG["free"])

    # Premium: unlimited scans
    if user.subscription_tier == "premium":
        return {
            "allowed": True,
            "searches_left": "unlimited",
            "camera_access": True,
            "ads": False,
        }

    today = date.today()
    daily_limit = tier_cfg.get("max_daily_scans", FREE_SEARCH_LIMIT)
    if daily_limit:
        tomorrow = date.fromordinal(today.toordinal() + 1)
        ai_count = (
            db.query(AIRequest)
            .filter(AIRequest.user_id == user.id, AIRequest.created_at >= today, AIRequest.created_at < tomorrow)
            .count()
        )
        search_count = (
            db.query(SearchLog)
            .filter(SearchLog.user_id == user.id, SearchLog.executed_at == today)
            .count()
        )
    else:
        ai_count = 0
        search_count = 0
    # Keep legacy text search count as part of daily budget
    search_count = (
        db.query(SearchLog).filter(SearchLog.user_id == user.id, SearchLog.executed_at == today).count()
        if daily_limit
        else 0
    )
    total_used = ai_count + search_count
    return {
        "allowed": (total_used < daily_limit) if daily_limit is not None else True,
        "searches_left": "unlimited" if daily_limit is None else max(0, daily_limit - total_used),
        "camera_access": False,
        "ads": True,
    }
