import os
import posixpath
import uuid
from dataclasses import dataclass
from ftplib import FTP, FTP_TLS, error_perm

from fastapi import UploadFile

from ..core.config import settings


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


def _ensure_posix_dir(ftp: FTP, directory: str) -> None:
    # directory must be absolute POSIX path.
    path = posixpath.normpath("/" + directory.lstrip("/"))
    parts = [p for p in path.split("/") if p]
    current = "/"
    ftp.cwd("/")
    for p in parts:
        current = posixpath.join(current, p)
        try:
            ftp.cwd(current)
        except Exception:
            try:
                ftp.mkd(current)
            except error_perm:
                # Another process may have created it; try again.
                pass
            ftp.cwd(current)


def _open_ftp() -> FTP:
    host = settings.library_ftp_host
    user = settings.library_ftp_username
    pwd = settings.library_ftp_password
    if not host or not user or not pwd:
        raise RuntimeError("FTP storage not configured. Set LIBRARY_FTP_HOST/USERNAME/PASSWORD.")

    timeout = float(settings.library_ftp_timeout_seconds or 30.0)
    if bool(settings.library_ftp_tls):
        ftp: FTP = FTP_TLS(timeout=timeout)
    else:
        ftp = FTP(timeout=timeout)

    ftp.connect(host=str(host), port=int(settings.library_ftp_port))
    ftp.login(user=str(user), passwd=str(pwd))

    if isinstance(ftp, FTP_TLS):
        # Secure both control + data channels.
        ftp.prot_p()
    try:
        ftp.set_pasv(True)
    except Exception:
        pass
    return ftp


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

        remote_dir = posixpath.join(settings.library_ftp_base_dir.strip().rstrip("/"), _remote_kind_dir(kind))
        remote_dir = posixpath.normpath("/" + remote_dir.lstrip("/"))

        ftp = _open_ftp()
        try:
            _ensure_posix_dir(ftp, remote_dir)
            ftp.cwd(remote_dir)
            file.file.seek(0)
            ftp.storbinary(f"STOR {filename}", file.file, blocksize=1024 * 128)
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
