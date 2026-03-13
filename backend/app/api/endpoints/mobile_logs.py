from datetime import datetime, timezone
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.user import User
from ...services.mobile_log_service import LOG_DIR, LOG_PATH, log_mobile_event
from ...core.security import decode_access_token
from ..admin_dependencies import get_current_admin

router = APIRouter()


class MobileLogEntry(BaseModel):
    timestamp: str | None = None
    level: str | None = None
    source: str | None = None
    message: str
    details: str | None = None


class MobileLogsPayload(BaseModel):
    events: list[MobileLogEntry] = Field(default_factory=list)
    app_version: str | None = None
    device: str | None = None


def get_optional_user(request: Request, db: Session) -> User | None:
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[-1].strip()
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except ValueError:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    try:
        return db.query(User).filter(User.id == int(user_id)).first()
    except OperationalError:
        # Allow mobile logs to be ingested even if the database is temporarily down.
        return None


@router.post("/mobile/logs")
def ingest_mobile_logs(payload: MobileLogsPayload, request: Request, db: Session = Depends(get_db)):
    if not payload.events:
        raise HTTPException(status_code=422, detail="No log events provided")

    user = get_optional_user(request, db)
    now = datetime.now(timezone.utc).isoformat()
    for entry in payload.events:
        event = {
            "received_at": now,
            "timestamp": entry.timestamp or now,
            "level": entry.level or "info",
            "source": entry.source or "app",
            "message": entry.message,
            "details": entry.details,
            "user_id": user.id if user else None,
            "user_email": user.email if user else None,
            "app_version": payload.app_version,
            "device": payload.device,
            "ip": request.client.host if request.client else None,
        }
        log_mobile_event(event)

    return {"detail": "ok", "count": len(payload.events)}


@router.get("/admin/mobile-logs")
def read_mobile_logs(limit: int = 200, admin=Depends(get_current_admin)):  # noqa: ARG001
    if limit <= 0:
        raise HTTPException(status_code=422, detail="Limit must be positive")
    log_path = Path(LOG_PATH)
    if not log_path.exists():
        return {"items": []}
    lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    # Newest first for admin view.
    items = list(reversed(lines))[:limit]
    return {"items": items}
