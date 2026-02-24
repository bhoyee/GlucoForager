from __future__ import annotations

import os
import re
import json
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.engine.url import make_url

from ..core.config import settings


BACKUP_FILENAME_RE = re.compile(r"^glucoforager-db-\d{8}-\d{6}\.dump$")


@dataclass(frozen=True)
class BackupFile:
    filename: str
    path: Path
    size_bytes: int
    created_at: datetime


class BackupError(RuntimeError):
    pass


def backup_dir() -> Path:
    directory = os.getenv("BACKUP_DIR", "backups")
    path = Path(directory)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _lock_path() -> Path:
    return backup_dir() / ".backup.lock"


def _status_path() -> Path:
    return backup_dir() / ".backup.status.json"


def read_backup_status() -> dict | None:
    path = _status_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def write_backup_status(payload: dict) -> None:
    directory = backup_dir()
    path = _status_path()
    tmp_path = directory / f"{path.name}.tmp"
    try:
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp_path.replace(path)
    except OSError:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass


def acquire_lock(ttl_seconds: int = 60 * 60) -> bool:
    lock = _lock_path()
    now = time.time()
    try:
        if lock.exists():
            try:
                age = now - lock.stat().st_mtime
                if age > ttl_seconds:
                    lock.unlink(missing_ok=True)
            except OSError:
                pass
        fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(str(int(now)))
        return True
    except FileExistsError:
        return False


def release_lock() -> None:
    try:
        _lock_path().unlink(missing_ok=True)
    except OSError:
        return


def pg_dump_executable() -> str:
    configured = (os.getenv("PG_DUMP_PATH") or "").strip()
    if configured:
        if Path(configured).exists():
            return configured
        resolved_config = shutil.which(configured)
        if resolved_config:
            return resolved_config
        raise BackupError(
            f"PG_DUMP_PATH is set but was not found: {configured}. "
            "Point it to the pg_dump executable (PostgreSQL client tools)."
        )

    resolved = shutil.which("pg_dump")
    if resolved:
        return resolved

    raise BackupError(
        "pg_dump was not found on this server. "
        "Install PostgreSQL client tools and ensure pg_dump is on PATH, "
        "or set PG_DUMP_PATH to the full path of the pg_dump executable."
    )


def _pg_dump_args(output_path: Path) -> tuple[list[str], dict]:
    url = make_url(settings.database_url)

    username = url.username or ""
    password = url.password or ""
    host = url.host or "localhost"
    port = str(url.port or 5432)
    database = (url.database or "").lstrip("/")

    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password

    args = [
        pg_dump_executable(),
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--verbose",
        "--host",
        host,
        "--port",
        port,
        "--username",
        username,
        "--dbname",
        database,
        "--file",
        str(output_path),
    ]
    return args, env


def create_backup() -> BackupFile:
    directory = backup_dir()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"glucoforager-db-{timestamp}.dump"
    output_path = directory / filename

    args, env = _pg_dump_args(output_path)

    # Write to a temporary file first, then atomically move into place.
    with tempfile.TemporaryDirectory(prefix="gf_backup_") as tmp:
        tmp_path = Path(tmp) / filename
        tmp_args, tmp_env = _pg_dump_args(tmp_path)
        subprocess.run(tmp_args, env=tmp_env, check=True)  # noqa: S603
        shutil.move(str(tmp_path), str(output_path))

    stat = output_path.stat()
    return BackupFile(
        filename=filename,
        path=output_path,
        size_bytes=stat.st_size,
        created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
    )


def list_backups() -> list[BackupFile]:
    directory = backup_dir()
    items: list[BackupFile] = []
    for path in directory.glob("glucoforager-db-*.dump"):
        if not BACKUP_FILENAME_RE.match(path.name):
            continue
        try:
            stat = path.stat()
        except OSError:
            continue
        items.append(
            BackupFile(
                filename=path.name,
                path=path,
                size_bytes=stat.st_size,
                created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            )
        )
    items.sort(key=lambda item: item.created_at, reverse=True)
    return items


def resolve_backup_path(filename: str) -> Path | None:
    if not BACKUP_FILENAME_RE.match(filename):
        return None
    path = backup_dir() / filename
    if not path.exists():
        return None
    return path


def prune_old_backups(retention_days: int | None = None) -> dict:
    configured = retention_days
    if configured is None:
        configured = int(os.getenv("BACKUP_RETENTION_DAYS", "7") or "7")
    retention_days = max(1, min(int(configured), 365))

    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    deleted = 0
    for item in list_backups():
        if item.created_at < cutoff:
            try:
                item.path.unlink(missing_ok=True)
                deleted += 1
            except OSError:
                continue
    return {"retention_days": retention_days, "deleted": deleted}
