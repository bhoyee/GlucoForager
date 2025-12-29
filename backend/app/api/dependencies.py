from datetime import date

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from ..core.constants import FREE_SEARCH_LIMIT
from ..core.security import decode_access_token
from ..database import get_db
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
    if user.subscription_tier == "premium":
        return {
            "allowed": True,
            "searches_left": "unlimited",
            "camera_access": True,
            "ads": False,
        }

    today = date.today()
    today_searches = (
        db.query(SearchLog).filter(SearchLog.user_id == user.id, SearchLog.executed_at == today).count()
    )
    return {
        "allowed": today_searches < FREE_SEARCH_LIMIT,
        "searches_left": max(0, FREE_SEARCH_LIMIT - today_searches),
        "camera_access": False,
        "ads": True,
    }
