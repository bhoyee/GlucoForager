import os
import uuid

from fastapi import UploadFile

from ..core.config import settings
from .ftp_storage_service import ftp_upload, open_shared_ftp


def _read_upload_size(file: UploadFile) -> int | None:
    try:
        pos = file.file.tell()
        file.file.seek(0, os.SEEK_END)
        size = int(file.file.tell())
        file.file.seek(pos, os.SEEK_SET)
        return size
    except Exception:
        return None


def store_recipe_image_upload(file: UploadFile, *, request_base_url: str) -> str:
    """
    Stores a recipe image upload and returns a public URL.
    - local: writes to UPLOADS_DIR and returns {request_base_url}/uploads/<uuid>.<ext>
    - ftp: uploads to shared hosting under RECIPE_FTP_BASE_DIR and returns {RECIPE_REMOTE_BASE_URL}/<uuid>.<ext>
    """

    extension = os.path.splitext(file.filename or "")[1].lower().strip()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise ValueError("Unsupported image type")

    size = _read_upload_size(file)
    max_bytes = int(settings.recipe_max_image_bytes)
    if size is not None and size > max_bytes:
        raise ValueError(f"File too large. Max {max_bytes} bytes.")

    filename = f"{uuid.uuid4().hex}{extension}"
    backend = str(settings.recipe_upload_storage_backend or "local").strip().lower()

    if backend == "ftp":
        base_url = (settings.recipe_remote_base_url or "").strip().rstrip("/")
        if not base_url:
            raise RuntimeError("Recipe FTP storage requires RECIPE_REMOTE_BASE_URL.")
        remote_dir = settings.recipe_ftp_base_dir.strip().rstrip("/")
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
        return f"{base_url}/{filename}"

    # local
    os.makedirs(settings.uploads_dir, exist_ok=True)
    destination = os.path.join(settings.uploads_dir, filename)
    file.file.seek(0)
    with open(destination, "wb") as target:
        while True:
            chunk = file.file.read(1024 * 128)
            if not chunk:
                break
            target.write(chunk)
    return f"{request_base_url.rstrip('/')}/uploads/{filename}"

