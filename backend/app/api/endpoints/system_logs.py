import json
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..admin_dependencies import get_current_admin
from ...services.system_log_service import LOG_DIR, LOG_PATH, log_system_event

router = APIRouter()

APP_LOG_PATH = Path(LOG_DIR) / "app.log"

_APP_LOG_LINE_RE = re.compile(
    r"^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) (?P<level>\w+) (?P<name>\S+) - (?P<message>.*)$"
)


def _read_app_log_entries(limit: int) -> list[dict]:
    """Reads the raw backend logger file (app.log) and normalizes entries to the
    same shape used by system.log, so both can be merged in one admin view."""
    if not APP_LOG_PATH.exists():
        return []
    lines = APP_LOG_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()
    entries: list[dict] = []
    for line in lines:
        match = _APP_LOG_LINE_RE.match(line)
        if match:
            iso_ts = match.group("timestamp").replace(" ", "T", 1).replace(",", ".", 1)
            level = match.group("level").lower()
            if level not in ("warning", "error", "critical"):
                continue
            entries.append({
                "timestamp": iso_ts,
                "level": level,
                "source": match.group("name"),
                "message": match.group("message"),
                "details": "",
            })
        elif entries:
            prev = entries[-1]
            prev["details"] = f"{prev['details']}\n{line}" if prev["details"] else line
    return entries[-limit:]


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

    system_items: list[dict] = []
    log_path = Path(LOG_PATH)
    if log_path.exists():
        lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        for line in lines[-limit:]:
            try:
                parsed = json.loads(line)
            except (json.JSONDecodeError, TypeError):
                parsed = None
            if isinstance(parsed, dict):
                parsed.setdefault("source", "system")
                system_items.append(parsed)
            else:
                system_items.append({"message": line, "source": "system"})

    app_items = _read_app_log_entries(limit)

    combined = system_items + app_items
    combined.sort(key=lambda item: item.get("timestamp") or item.get("received_at") or "", reverse=True)
    return {"items": combined[:limit]}


@router.delete("/admin/system-logs")
def clear_system_logs(admin=Depends(get_current_admin)):  # noqa: ARG001
    return _clear_log_files(LOG_PATH)
