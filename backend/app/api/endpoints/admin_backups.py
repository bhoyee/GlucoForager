from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse

from ..admin_dependencies import get_current_admin
from ...services.backup_service import (
    BackupError,
    acquire_lock,
    create_backup,
    list_backups,
    pg_dump_executable,
    prune_old_backups,
    read_backup_status,
    release_lock,
    resolve_backup_path,
    write_backup_status,
)

router = APIRouter()


def _file_item(item) -> dict:
    return {
        "filename": item.filename,
        "size_bytes": item.size_bytes,
        "created_at": item.created_at.isoformat(),
    }


@router.get("/admin/backups")
def get_backups(admin=Depends(get_current_admin)):  # noqa: ARG001
    prune = prune_old_backups()
    items = list_backups()
    latest = items[0] if items else None
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "prune": prune,
        "status": read_backup_status(),
        "latest": _file_item(latest) if latest else None,
        "total": len(items),
        "items": [_file_item(item) for item in items],
    }


@router.post("/admin/backups/run")
def run_backup(background_tasks: BackgroundTasks, admin=Depends(get_current_admin)):  # noqa: ARG001
    if not acquire_lock(ttl_seconds=60 * 60 * 3):
        raise HTTPException(status_code=409, detail="A backup is already running.")

    try:
        pg_dump_executable()
    except BackupError as exc:
        release_lock()
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    def _do_backup() -> None:
        started_at = datetime.now(timezone.utc).isoformat()
        write_backup_status({"state": "running", "started_at": started_at})
        try:
            created = create_backup()
            prune = prune_old_backups()
            write_backup_status(
                {
                    "state": "success",
                    "started_at": started_at,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "latest": _file_item(created),
                    "prune": prune,
                }
            )
        except Exception as exc:  # noqa: BLE001
            write_backup_status(
                {
                    "state": "error",
                    "started_at": started_at,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "error": str(exc),
                }
            )
            raise
        finally:
            release_lock()

    background_tasks.add_task(_do_backup)
    return {"detail": "started"}


@router.get("/admin/backups/download/{filename}")
def download_backup(filename: str, admin=Depends(get_current_admin)):  # noqa: ARG001
    path = resolve_backup_path(filename)
    if not path:
        raise HTTPException(status_code=404, detail="Backup not found.")
    return FileResponse(
        path=str(path),
        media_type="application/octet-stream",
        filename=filename,
    )


@router.delete("/admin/backups/{filename}")
def delete_backup(filename: str, admin=Depends(get_current_admin)):  # noqa: ARG001
    path = resolve_backup_path(filename)
    if not path:
        raise HTTPException(status_code=404, detail="Backup not found.")
    try:
        path.unlink(missing_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Unable to delete backup: {exc}") from exc
    return {"detail": "deleted"}
