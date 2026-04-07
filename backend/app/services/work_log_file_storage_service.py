import os
import uuid
from dataclasses import dataclass

from fastapi import UploadFile

from ..core.config import settings
from .ftp_storage_service import ftp_upload, open_shared_ftp


@dataclass(frozen=True)
class StoredWorkLogAttachment:
    filename: str
    original_name: str | None
    url: str
    content_type: str | None
    size_bytes: int | None
    storage_backend: str
    remote_dir: str | None = None


def _normalize_public_base_url(raw: str) -> str:
    value = str(raw or "").strip().rstrip("/")
    if not value:
        return value
    if value.startswith("http://") or value.startswith("https://"):
        return value
    return "https://" + value.lstrip("/")


def _read_upload_size(file: UploadFile) -> int | None:
    try:
        pos = file.file.tell()
        file.file.seek(0, os.SEEK_END)
        size = int(file.file.tell())
        file.file.seek(pos, os.SEEK_SET)
        return size
    except Exception:
        return None


def _guess_kind(content_type: str | None, extension: str) -> str:
    ct = (content_type or "").strip().lower()
    ext = (extension or "").strip().lower()
    if ct.startswith("image/") or ext in {".jpg", ".jpeg", ".png", ".webp"}:
        return "image"
    if ct == "application/pdf" or ext == ".pdf":
        return "document"
    if ct in {"application/zip", "application/x-zip-compressed"} or ext == ".zip":
        return "archive"
    if ct in {"application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"} or ext in {".xls", ".xlsx"}:
        return "document"
    if ct in {
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    } or ext in {".doc", ".docx"}:
        return "document"
    if ct == "video/mp4" or ext == ".mp4":
        return "video"
    return "document"


def _max_bytes_for_kind(kind: str) -> int:
    # Reuse inbox attachment limits for work logs.
    k = str(kind or "").strip().lower()
    if k == "image":
        return int(settings.inbox_file_max_image_bytes)
    if k == "video":
        return int(settings.inbox_file_max_video_bytes)
    if k == "archive":
        # Archives can contain many images; allow up to the video limit.
        return int(settings.inbox_file_max_video_bytes)
    return int(settings.inbox_file_max_pdf_bytes)


def store_work_log_attachment(file: UploadFile) -> StoredWorkLogAttachment:
    """
    Stores work log attachments using the same storage backend as staff inbox attachments.

    - local: UPLOADS_DIR/work-logs and returns /uploads URL
    - ftp: uploads under INBOX_FILE_FTP_BASE_DIR/work-logs and returns INBOX_FILE_REMOTE_BASE_URL/work-logs/<uuid>.<ext>
    """

    original_name = (file.filename or "").strip() or None
    extension = os.path.splitext(file.filename or "")[1].lower()
    kind = _guess_kind(file.content_type, extension)

    max_bytes = _max_bytes_for_kind(kind)
    size = _read_upload_size(file)
    if size is not None and size > max_bytes:
        raise ValueError(f"File too large. Max {max_bytes} bytes.")

    if extension not in {".jpg", ".jpeg", ".png", ".webp", ".pdf", ".mp4", ".xls", ".xlsx", ".doc", ".docx", ".zip"}:
        raise ValueError("Unsupported attachment type")

    filename = f"{uuid.uuid4().hex}{extension}"
    backend = str(settings.inbox_file_storage_backend or "local").strip().lower()

    if backend == "ftp":
        base_url = _normalize_public_base_url(settings.inbox_file_remote_base_url or "")
        if not base_url:
            raise RuntimeError("INBOX_FILE_REMOTE_BASE_URL not configured.")

        base_dir = str(settings.inbox_file_ftp_base_dir or "").strip().rstrip("/")
        if not base_dir:
            raise RuntimeError("INBOX_FILE_FTP_BASE_DIR not configured.")

        remote_dir = f"{base_dir}/work-logs"

        ftp = open_shared_ftp()
        try:
            file.file.seek(0)
            ftp_upload(ftp, remote_dir=remote_dir, filename=filename, fileobj=file.file)
        finally:
            try:
                ftp.quit()
            except Exception:
                try:
                    ftp.close()
                except Exception:
                    pass

        public_url = f"{base_url}/work-logs/{filename}"
        return StoredWorkLogAttachment(
            filename=filename,
            original_name=original_name,
            url=public_url,
            content_type=file.content_type,
            size_bytes=size,
            storage_backend="ftp",
            remote_dir=remote_dir,
        )

    subdir = os.path.join(settings.uploads_dir, "work-logs")
    os.makedirs(subdir, exist_ok=True)
    destination = os.path.join(subdir, filename)
    file.file.seek(0)
    with open(destination, "wb") as target:
        while True:
            chunk = file.file.read(1024 * 128)
            if not chunk:
                break
            target.write(chunk)

    return StoredWorkLogAttachment(
        filename=filename,
        original_name=original_name,
        url=f"/uploads/work-logs/{filename}",
        content_type=file.content_type,
        size_bytes=size,
        storage_backend="local",
        remote_dir=None,
    )
