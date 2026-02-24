from __future__ import annotations

import os
import shutil
import tempfile
import time
from datetime import datetime, timedelta, timezone
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

_LAST_CLEANUP_TS: float = 0.0
_CLEANUP_INTERVAL_SECONDS = 6 * 60 * 60


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


def _classify_ai_job_error(job: AIJob) -> tuple[str, str]:
    """Return (error_type, error_code)."""
    result = job.result or {}
    error_payload = result.get("error") if isinstance(result, dict) else None
    if isinstance(error_payload, dict):
        error_type = (error_payload.get("type") or "").strip().lower()
        error_code = (error_payload.get("code") or "").strip().lower()
        if error_type and error_code:
            return error_type, error_code

    raw = (job.error or "").strip().lower()
    if "image not related to food" in raw:
        return "invalid_input", "not_food"
    if "content not related to food" in raw:
        return "invalid_input", "not_food"
    if "please enter real ingredients" in raw:
        return "invalid_input", "not_food"
    return "operational", "unknown"


def _maybe_cleanup_old_jobs(db: Session) -> dict:
    global _LAST_CLEANUP_TS  # noqa: PLW0603
    now = time.time()
    if now - _LAST_CLEANUP_TS < _CLEANUP_INTERVAL_SECONDS:
        return {"ran": False}

    retention_days = int(os.getenv("AI_JOB_RETENTION_DAYS", "30") or "30")
    retention_days = max(7, min(retention_days, 365))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).replace(tzinfo=None)

    try:
        deleted = (
            db.query(AIJob)
            .filter(AIJob.updated_at.is_not(None))
            .filter(AIJob.updated_at < cutoff)
            .filter(AIJob.status.in_(["completed", "failed"]))
            .delete(synchronize_session=False)
        )
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        deleted = 0

    _LAST_CLEANUP_TS = now
    return {"ran": True, "retention_days": retention_days, "deleted": int(deleted)}


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
        cleanup = _maybe_cleanup_old_jobs(db)

        recent_failed = (
            db.query(AIJob)
            .filter(AIJob.status == "failed")
            .order_by(AIJob.updated_at.desc())
            .limit(200)
            .all()
        )
        pending = (
            db.query(func.count(AIJob.id))
            .filter(AIJob.status.in_(["pending", "running"]))
            .scalar()
            or 0
        )
        failed_total = db.query(func.count(AIJob.id)).filter(AIJob.status == "failed").scalar() or 0

        invalid_input_items: list[dict] = []
        operational_items: list[dict] = []
        invalid_reason_counts: dict[str, int] = {}
        operational_reason_counts: dict[str, int] = {}

        for job in recent_failed:
            error_type, error_code = _classify_ai_job_error(job)
            payload = {
                "id": job.id,
                "user_id": job.user_id,
                "source": job.source,
                "error_type": error_type,
                "error_code": error_code,
                "error": (job.error or "")[:300],
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "updated_at": job.updated_at.isoformat() if job.updated_at else None,
            }
            if error_type == "invalid_input":
                invalid_input_items.append(payload)
                invalid_reason_counts[error_code] = invalid_reason_counts.get(error_code, 0) + 1
            else:
                operational_items.append(payload)
                operational_reason_counts[error_code] = operational_reason_counts.get(error_code, 0) + 1

        failed_invalid_input = len(invalid_input_items)
        failed_operational = len(operational_items)

        status = "ok"
        if failed_operational > 0 or pending >= 25:
            status = "warning"
        services["queue"] = {
            "status": status,
            "detail": f"Pending: {pending} | Failed: {failed_total}",
            "pending": int(pending),
            "failed": int(failed_total),
            "failed_invalid_input": int(failed_invalid_input),
            "failed_operational": int(failed_operational),
            "failed_breakdown": {
                "invalid_input": dict(sorted(invalid_reason_counts.items(), key=lambda item: item[1], reverse=True)[:8]),
                "operational": dict(sorted(operational_reason_counts.items(), key=lambda item: item[1], reverse=True)[:8]),
            },
            "cleanup": cleanup,
            "failed_operational_items": operational_items[:15],
            "failed_invalid_input_items": invalid_input_items[:15],
            "note": "AI jobs run inside the API container. If pending jobs keep increasing, check API CPU/memory and recent errors.",
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
