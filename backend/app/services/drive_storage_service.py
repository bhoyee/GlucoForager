import os
import uuid
from dataclasses import dataclass

from fastapi import UploadFile

from ..core.config import settings
from .ftp_storage_service import ftp_delete_file, ftp_download_bytes, ftp_upload, open_shared_ftp


@dataclass(frozen=True)
class StoredDriveObject:
    kind: str  # "image" | "document" | "video"
    filename: str
    storage_backend: str
    remote_dir: str
    size_bytes: int | None = None


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
        return int(settings.drive_max_image_bytes)
    if k == "video":
        return int(settings.drive_max_video_bytes)
    return int(settings.drive_max_pdf_bytes)


def _read_upload_size(file: UploadFile) -> int | None:
    try:
        pos = file.file.tell()
        file.file.seek(0, os.SEEK_END)
        size = int(file.file.tell())
        file.file.seek(pos, os.SEEK_SET)
        return size
    except Exception:
        return None


def _remote_kind_dir(kind: str) -> str:
    k = str(kind or "").strip().lower()
    if k == "image":
        return "images"
    if k == "video":
        return "videos"
    return "pdfs"


def drive_remote_dir_for_user(*, staff_user_id: int, kind: str) -> str:
    base_dir = str(settings.drive_ftp_base_dir or "").strip().rstrip("/")
    if not base_dir:
        base_dir = "/public_html/glucoforager.com/private-drive"
    return f"{base_dir}/{int(staff_user_id)}/{_remote_kind_dir(kind)}"


def store_drive_upload(*, staff_user_id: int, file: UploadFile) -> StoredDriveObject:
    extension = os.path.splitext(file.filename or "")[1].lower()
    kind = _guess_kind(file.content_type, extension)

    max_bytes = _max_bytes_for_kind(kind)
    size = _read_upload_size(file)
    if size is not None and size > max_bytes:
        raise ValueError(f"File too large. Max {max_bytes} bytes.")

    if kind == "image" and extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise ValueError("Unsupported image type")
    if kind == "document" and extension != ".pdf":
        raise ValueError("Unsupported document type")
    if kind == "video" and extension != ".mp4":
        raise ValueError("Unsupported video type")

    filename = f"{uuid.uuid4().hex}{extension}"
    backend = str(settings.drive_storage_backend or "ftp").strip().lower()

    if backend == "ftp":
        remote_dir = drive_remote_dir_for_user(staff_user_id=staff_user_id, kind=kind)
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
        return StoredDriveObject(kind=kind, filename=filename, storage_backend="ftp", remote_dir=remote_dir, size_bytes=size)

    # local (dev fallback)
    subdir = os.path.join(settings.uploads_dir, "private-drive", str(int(staff_user_id)), _remote_kind_dir(kind))
    os.makedirs(subdir, exist_ok=True)
    destination = os.path.join(subdir, filename)
    file.file.seek(0)
    with open(destination, "wb") as target:
        while True:
            chunk = file.file.read(1024 * 128)
            if not chunk:
                break
            target.write(chunk)
    return StoredDriveObject(kind=kind, filename=filename, storage_backend="local", remote_dir=subdir, size_bytes=size)


def load_drive_bytes(*, storage_backend: str, remote_dir: str, filename: str) -> bytes:
    backend = str(storage_backend or "").strip().lower()
    if backend == "ftp":
        ftp = open_shared_ftp()
        try:
            return ftp_download_bytes(ftp, remote_dir=remote_dir, filename=filename)
        finally:
            try:
                ftp.quit()
            except Exception:
                try:
                    ftp.close()
                except Exception:
                    pass
    path = os.path.join(remote_dir, filename)
    with open(path, "rb") as f:
        return f.read()


def delete_drive_object(*, storage_backend: str, remote_dir: str, filename: str) -> None:
    backend = str(storage_backend or "").strip().lower()
    if backend == "ftp":
        ftp = open_shared_ftp()
        try:
            ftp_delete_file(ftp, remote_dir=remote_dir, filename=filename)
        finally:
            try:
                ftp.quit()
            except Exception:
                try:
                    ftp.close()
                except Exception:
                    pass
        return
    path = os.path.join(remote_dir, filename)
    try:
        os.remove(path)
    except FileNotFoundError:
        pass

