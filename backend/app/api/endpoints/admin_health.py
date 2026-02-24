from __future__ import annotations

import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...core.config import settings
from ...database import get_db
from ...models.ai_job import AIJob
from ...services.cache_service import CacheService

router = APIRouter()


def _severity(status: str) -> int:
    if status == "error":
        return 3
    if status == "warning":
        return 2
    return 1


def _disk_usage_path() -> str:
    if os.name != "nt" and os.path.exists("/"):
        return "/"
    uploads_dir = Path(settings.uploads_dir).resolve()
    anchor = uploads_dir.anchor
    return anchor or str(uploads_dir)


@router.get("/admin/health")
def admin_health(
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    services: dict[str, dict] = {}

    # Application
    services["application"] = {"status": "ok", "detail": "Running"}

    # Database
    try:
        db.execute(text("SELECT 1"))
        services["database"] = {"status": "ok", "detail": "Connected"}
    except Exception as exc:  # noqa: BLE001
        services["database"] = {"status": "error", "detail": f"Error: {str(exc)[:120]}"}

    # Cache (Redis)
    cache_status = {"status": "warning", "detail": "Not configured"}
    try:
        cache = CacheService()
        if cache.client:
            key = f"healthcheck:{os.getpid()}"
            cache.client.setex(key, 10, "ok")
            value = cache.client.get(key)
            ok = value is not None and value.decode("utf-8") == "ok"
            cache_status = {
                "status": "ok" if ok else "warning",
                "detail": "Readable/Writable" if ok else "Connected (read/write failed)",
                "backend": "redis",
            }
        else:
            cache_status = {"status": "warning", "detail": "Using in-memory cache", "backend": "memory"}
    except Exception as exc:  # noqa: BLE001
        cache_status = {"status": "error", "detail": f"Error: {str(exc)[:120]}"}
    services["cache"] = cache_status

    # Queue snapshot (AI jobs table)
    try:
        pending = (
            db.query(func.count(AIJob.id))
            .filter(AIJob.status.in_(["pending", "running"]))
            .scalar()
            or 0
        )
        failed = db.query(func.count(AIJob.id)).filter(AIJob.status == "failed").scalar() or 0
        status = "ok"
        if failed > 0 or pending >= 25:
            status = "warning"
        services["queue"] = {
            "status": status,
            "detail": f"Pending: {pending} | Failed: {failed}",
            "pending": int(pending),
            "failed": int(failed),
            "note": "Ensure the API worker is running (BackgroundTasks are processed by the API process).",
        }
    except Exception as exc:  # noqa: BLE001
        services["queue"] = {"status": "error", "detail": f"Error: {str(exc)[:120]}"}

    # Mail config
    mail_provider = "none"
    configured = False
    if settings.resend_api_key:
        configured = True
        mail_provider = "resend"
    elif settings.smtp_host and settings.smtp_from_address:
        configured = True
        mail_provider = "smtp"
    services["mail"] = {
        "status": "ok" if configured else "warning",
        "detail": "Configured" if configured else "Not configured",
        "provider": mail_provider,
    }

    # Storage
    uploads_dir = Path(settings.uploads_dir)
    try:
        uploads_dir.mkdir(parents=True, exist_ok=True)
        writable = os.access(str(uploads_dir), os.W_OK)
        # Extra safety: attempt a small write.
        if writable:
            with tempfile.NamedTemporaryFile(dir=str(uploads_dir), prefix="health_", delete=True) as tmp:
                tmp.write(b"ok")
                tmp.flush()
        services["storage"] = {
            "status": "ok" if writable else "warning",
            "detail": "Writable" if writable else "Not writable",
            "path": str(uploads_dir),
        }
    except Exception as exc:  # noqa: BLE001
        services["storage"] = {"status": "error", "detail": f"Error: {str(exc)[:120]}", "path": str(uploads_dir)}

    # Disk usage
    try:
        path = _disk_usage_path()
        usage = shutil.disk_usage(path)
        used_pct = 0.0 if usage.total == 0 else (usage.used / usage.total) * 100
        status = "ok"
        if used_pct >= 92:
            status = "error"
        elif used_pct >= 85:
            status = "warning"
        services["disk"] = {
            "status": status,
            "detail": f"{used_pct:.0f}% used ({usage.used/1e9:.1f} GB / {usage.total/1e9:.1f} GB)",
            "path": path,
            "used_percent": round(used_pct, 2),
        }
    except Exception as exc:  # noqa: BLE001
        services["disk"] = {"status": "error", "detail": f"Error: {str(exc)[:120]}"}

    # CPU load (Linux)
    try:
        if hasattr(os, "getloadavg"):
            load1, load5, load15 = os.getloadavg()
            status = "ok"
            if load1 >= 1.5:
                status = "warning"
            services["cpu"] = {
                "status": status,
                "detail": f"Load avg: {load1:.2f}, {load5:.2f}, {load15:.2f}",
                "load1": load1,
                "load5": load5,
                "load15": load15,
            }
        else:
            services["cpu"] = {"status": "warning", "detail": "Load avg unavailable on this platform"}
    except Exception as exc:  # noqa: BLE001
        services["cpu"] = {"status": "error", "detail": f"Error: {str(exc)[:120]}"}

    overall = "ok"
    if any(_severity(s.get("status", "ok")) == 3 for s in services.values()):
        overall = "error"
    elif any(_severity(s.get("status", "ok")) == 2 for s in services.values()):
        overall = "warning"

    return {
        "status": overall,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "services": services,
    }

