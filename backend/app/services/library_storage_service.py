import os
import uuid
from dataclasses import dataclass

from fastapi import UploadFile

from ..core.config import settings
from .ftp_storage_service import ftp_upload, open_shared_ftp


@dataclass(frozen=True)
class StoredLibraryObject:
    kind: str  # "image" | "document" | "video"
    filename: str
    url: str


def _remote_kind_dir(kind: str) -> str:
    k = str(kind or "").strip().lower()
    if k == "image":
        return "images"
    if k == "video":
        return "videos"
    return "pdfs"


def _guess_kind(content_type: str | None, extension: str) -> str:
    ct = (content_type or "").strip().lower()
    ext = (extension or "").strip().lower()
    if ct.startswith("image/") or ext in {".jpg", ".jpeg", ".png", ".webp"}:
        return "image"
    if ct == "application/pdf" or ext == ".pdf":
        return "document"
    if ct == "video/mp4" or ext == ".mp4":
        return "video"
    return "document"


def _max_bytes_for_kind(kind: str) -> int:
    k = str(kind or "").strip().lower()
    if k == "image":
        return int(settings.library_max_image_bytes)
    if k == "video":
        return int(settings.library_max_video_bytes)
    return int(settings.library_max_pdf_bytes)


def _read_upload_size(file: UploadFile) -> int | None:
    try:
        pos = file.file.tell()
        file.file.seek(0, os.SEEK_END)
        size = int(file.file.tell())
        file.file.seek(pos, os.SEEK_SET)
        return size
    except Exception:
        return None


def store_library_upload(file: UploadFile) -> StoredLibraryObject:
    """
    Stores the upload according to LIBRARY_STORAGE_BACKEND.
    - local: writes to UPLOADS_DIR/library and returns /uploads URL
    - ftp: uploads to shared hosting and returns public salisu.dev URL
    """

    extension = os.path.splitext(file.filename or "")[1].lower()
    kind = _guess_kind(file.content_type, extension)

    # Enforce size limits (best effort).
    max_bytes = _max_bytes_for_kind(kind)
    size = _read_upload_size(file)
    if size is not None and size > max_bytes:
        raise ValueError(f"File too large. Max {max_bytes} bytes.")

    # Enforce type/extension constraints (tight MVP).
    if kind == "image" and extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise ValueError("Unsupported image type")
    if kind == "document" and extension != ".pdf":
        raise ValueError("Unsupported document type")
    if kind == "video" and extension != ".mp4":
        raise ValueError("Unsupported video type")

    filename = f"{uuid.uuid4().hex}{extension}"
    backend = str(settings.library_storage_backend or "local").strip().lower()

    if backend == "ftp":
        base_url = (settings.library_remote_base_url or "").strip().rstrip("/")
        if not base_url:
            raise RuntimeError("FTP storage requires LIBRARY_REMOTE_BASE_URL (public URL prefix).")

        remote_dir = f"{settings.library_ftp_base_dir.strip().rstrip('/')}/{_remote_kind_dir(kind)}"
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

        public_url = f"{base_url}/{_remote_kind_dir(kind)}/{filename}"
        return StoredLibraryObject(kind=kind, filename=filename, url=public_url)

    # local (default)
    subdir = os.path.join(settings.uploads_dir, "library")
    os.makedirs(subdir, exist_ok=True)
    destination = os.path.join(subdir, filename)
    file.file.seek(0)
    with open(destination, "wb") as target:
        while True:
            chunk = file.file.read(1024 * 128)
            if not chunk:
                break
            target.write(chunk)

    return StoredLibraryObject(kind=kind, filename=filename, url=f"/uploads/library/{filename}")
