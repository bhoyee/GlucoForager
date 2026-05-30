from datetime import datetime, timezone
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..admin_dependencies import get_current_admin
from ...services.system_log_service import LOG_DIR, LOG_PATH, log_system_event

router = APIRouter()


def _clear_log_files(base_path: str) -> dict:
    log_path = Path(base_path)
    deleted_rotated = 0
    truncated = False

    for path in Path(LOG_DIR).glob(f"{log_path.name}.*"):
        try:
            if path.is_file():
                path.unlink()
                deleted_rotated += 1
        except OSError:
            continue

    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text("", encoding="utf-8")
        truncated = True
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to clear system logs: {str(exc)[:160]}") from exc

    return {"detail": "ok", "truncated": truncated, "deleted_rotated": deleted_rotated}


class SystemLogEntry(BaseModel):
    timestamp: str | None = None
    level: str | None = None
    source: str | None = None
    message: str
    details: str | None = None


class SystemLogsPayload(BaseModel):
    events: list[SystemLogEntry] = Field(default_factory=list)
    app_version: str | None = None
    device: str | None = None
    path: str | None = None


@router.post("/system/logs")
def ingest_system_logs(payload: SystemLogsPayload, request: Request):
    if not payload.events:
        raise HTTPException(status_code=422, detail="No log events provided")

    now = datetime.now(timezone.utc).isoformat()
    for entry in payload.events:
        event = {
            "received_at": now,
            "timestamp": entry.timestamp or now,
            "level": entry.level or "info",
            "source": entry.source or "web",
            "message": entry.message,
            "details": entry.details,
            "app_version": payload.app_version,
            "device": payload.device,
            "path": payload.path,
            "ip": request.client.host if request.client else None,
        }
        log_system_event(event)

    return {"detail": "ok", "count": len(payload.events)}


@router.get("/admin/system-logs")
def read_system_logs(limit: int = 200, admin=Depends(get_current_admin)):  # noqa: ARG001
    if limit <= 0:
        raise HTTPException(status_code=422, detail="Limit must be positive")
    log_path = Path(LOG_PATH)
    if not log_path.exists():
        return {"items": []}
    lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    items = list(reversed(lines))[:limit]
    return {"items": items}


@router.delete("/admin/system-logs")
def clear_system_logs(admin=Depends(get_current_admin)):  # noqa: ARG001
    return _clear_log_files(LOG_PATH)
