from __future__ import annotations

import os
from urllib.parse import urlparse
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...core.config import settings
from ...database import get_db
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_library_item import StaffLibraryItem
from ...models.staff_user import StaffUser
from ...services.ftp_storage_service import open_shared_ftp
from ...services.library_storage_service import store_library_upload
from ...services.staff_rbac_service import StaffRBACService


router = APIRouter(prefix="/admin/library", tags=["admin-library"])


def _is_admin(db: Session, staff: StaffUser) -> bool:
    perms = StaffRBACService.get_user_permission_keys(db, staff.id)
    return StaffRBACService.has_permission(perms, "*") or StaffRBACService.has_permission(perms, "admin.manage")


def _normalize_folder(folder: str | None) -> str | None:
    if folder is None:
        return None
    cleaned = str(folder).strip().lower()
    if not cleaned:
        return None
    return cleaned[:40]


def _normalize_tags(raw: str | None) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    tokens: list[str] = []
    for part in text.replace(";", ",").split(","):
        t = str(part).strip().lower()
        if not t:
            continue
        t = t.replace("#", "")
        if not t:
            continue
        t = t[:32]
        if t not in tokens:
            tokens.append(t)
    if not tokens:
        return None
    return "," + ",".join(tokens[:20]) + ","


def _safe_unlink_local(path: str) -> bool:
    try:
        if os.path.isfile(path):
            os.remove(path)
            return True
    except Exception:
        return False
    return False


def _delete_remote_file(item: StaffLibraryItem) -> tuple[bool, str | None]:
    """
    Best-effort deletion of the underlying file (local or FTP).
    Returns (deleted, error_message).
    """

    url = str(getattr(item, "url", "") or "").strip()
    if not url:
        return False, "missing_url"

    # FTP-backed files (shared hosting) - only delete when URL matches configured base URL.
    base_url = str(settings.library_remote_base_url or "").strip().rstrip("/")
    if base_url:
        if not (base_url.startswith("http://") or base_url.startswith("https://")):
            base_url = "https://" + base_url.lstrip("/")
        try:
            base = urlparse(base_url)
            u = urlparse(url)
            if base.netloc and u.netloc and base.netloc.lower() == u.netloc.lower() and u.path.startswith(base.path.rstrip("/") + "/"):
                rel = u.path[len(base.path.rstrip("/")) + 1 :]  # "<dir>/<filename>"
                parts = [p for p in rel.split("/") if p]
                if len(parts) >= 2:
                    remote_dirname = parts[0].strip().lower()
                    filename = parts[-1].strip()
                    if remote_dirname in {"images", "pdfs", "videos"} and filename:
                        remote_dir = f"{settings.library_ftp_base_dir.strip().rstrip('/')}/{remote_dirname}"
                        ftp = open_shared_ftp()
                        try:
                            try:
                                ftp.cwd("/" + remote_dir.lstrip("/"))
                            except Exception:
                                return False, "remote_dir_missing"
                            try:
                                ftp.delete(filename)
                                return True, None
                            except Exception as exc:
                                msg = str(exc)
                                if "550" in msg:
                                    return False, "remote_file_missing"
                                return False, f"ftp_delete_failed:{msg[:120]}"
                        finally:
                            try:
                                ftp.quit()
                            except Exception:
                                try:
                                    ftp.close()
                                except Exception:
                                    pass
        except Exception as exc:
            return False, f"url_parse_failed:{str(exc)[:120]}"

    # Local disk-backed files - only delete within uploads_dir/library.
    if "/uploads/library/" in url:
        filename = url.split("/uploads/library/", 1)[1].split("?", 1)[0].split("#", 1)[0].strip().split("/")[-1]
        if filename and filename.replace(".", "").replace("-", "").replace("_", "").isalnum():
            local_path = os.path.join(settings.uploads_dir, "library", filename)
            deleted = _safe_unlink_local(local_path)
            return (deleted, None if deleted else "local_file_missing_or_unlink_failed")

    return False, "unknown_storage"


@router.get("")
def list_library(
    folder: str | None = None,
    kind: str | None = None,
    q: str | None = None,
    tag: str | None = None,
    include_deleted: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("library.read")),
):
    query = db.query(StaffLibraryItem)

    folder_norm = _normalize_folder(folder)
    if folder_norm:
        query = query.filter(StaffLibraryItem.folder == folder_norm)

    if kind:
        kind_norm = str(kind).strip().lower()
        if kind_norm not in {"document", "image", "video"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid kind")
        query = query.filter(StaffLibraryItem.kind == kind_norm)

    if tag:
        t = str(tag).strip().lower().replace("#", "")[:32]
        if t:
            query = query.filter(func.coalesce(StaffLibraryItem.tags, "").ilike(f"%,{t},%"))

    if q:
        needle = str(q).strip()
        if needle:
            like = f"%{needle}%"
            query = query.filter(
                or_(
                    StaffLibraryItem.title.ilike(like),
                    func.coalesce(StaffLibraryItem.original_filename, "").ilike(like),
                    func.coalesce(StaffLibraryItem.tags, "").ilike(like),
                )
            )

    if not include_deleted:
        query = query.filter(StaffLibraryItem.is_deleted.is_(False))
    else:
        if not _is_admin(db, current_staff):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    query = query.order_by(StaffLibraryItem.created_at.desc())
    items = query.all()
    return {
        "items": [
            {
                "id": i.id,
                "staff_user_id": i.staff_user_id,
                "kind": i.kind,
                "folder": i.folder,
                "title": i.title,
                "url": i.url,
                "original_filename": getattr(i, "original_filename", None),
                "content_type": getattr(i, "content_type", None),
                "tags": [t for t in str(getattr(i, "tags", "") or "").split(",") if t],
                "is_deleted": bool(i.is_deleted),
                "deleted_at": i.deleted_at.isoformat() if i.deleted_at else None,
                "deleted_by_staff_user_id": i.deleted_by_staff_user_id,
                "created_at": i.created_at.isoformat() if i.created_at else None,
            }
            for i in items
        ]
    }


@router.get("/folders")
def list_folders(
    include_deleted: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("library.read")),
):
    query = db.query(StaffLibraryItem.folder, func.count(StaffLibraryItem.id)).group_by(StaffLibraryItem.folder)
    if not include_deleted:
        query = query.filter(StaffLibraryItem.is_deleted.is_(False))
    else:
        if not _is_admin(db, current_staff):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    rows = query.order_by(func.count(StaffLibraryItem.id).desc()).all()
    return {"items": [{"folder": str(r[0] or "general"), "count": int(r[1] or 0)} for r in rows]}


@router.post("/upload")
def upload_to_library(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    folder: str = Form("general"),
    tags: str | None = Form(None),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("library.upload")),
):
    content_type = (file.content_type or "").lower().strip()
    extension = os.path.splitext(file.filename or "")[1].lower().strip()

    is_image = content_type.startswith("image/") or extension in {".jpg", ".jpeg", ".png", ".webp"}
    is_video = content_type == "video/mp4" or extension == ".mp4"
    is_pdf = content_type == "application/pdf" or extension == ".pdf"
    allowed_docs = {
        "application/pdf",
    }
    if not is_image and not is_video and not is_pdf and content_type not in allowed_docs:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type")

    if is_image and extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image type")
    if is_video and extension != ".mp4":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported video type")
    if (not is_image) and (not is_video) and extension != ".pdf":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported document type")

    try:
        stored = store_library_upload(file)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Upload failed")

    url = stored.url
    if url.startswith("/"):
        base_url = str(request.base_url).rstrip("/")
        url = f"{base_url}{url}"
    item = StaffLibraryItem(
        staff_user_id=current_staff.id,
        kind=stored.kind,
        folder=_normalize_folder(folder) or "general",
        title=title.strip()[:160] or (file.filename or "Untitled")[:160],
        url=url,
        original_filename=(file.filename or None),
        content_type=(file.content_type or None),
        tags=_normalize_tags(tags),
        is_deleted=False,
        created_at=datetime.utcnow(),
    )
    db.add(item)
    db.flush()
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="library.upload",
            entity="staff_library_items",
            entity_id=str(item.id),
            details={
                "kind": item.kind,
                "folder": item.folder,
                "title": item.title,
                "url": item.url,
                "original_filename": getattr(item, "original_filename", None),
                "content_type": getattr(item, "content_type", None),
                "tags": [t for t in str(getattr(item, "tags", "") or "").split(",") if t],
            },
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(item)
    return {
        "ok": True,
        "item": {
            "id": item.id,
            "url": item.url,
            "storage_backend": stored.storage_backend,
            "remote_dir": stored.remote_dir,
            "filename": stored.filename,
            "size_bytes": stored.size_bytes,
        },
    }


@router.delete("/items/{item_id}")
def soft_delete_item(
    request: Request,
    item_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("library.delete_own")),
):
    item = db.query(StaffLibraryItem).filter(StaffLibraryItem.id == int(item_id)).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if item.is_deleted:
        return {"ok": True}

    admin_override = False
    if int(item.staff_user_id) != int(current_staff.id):
        # Only admins can delete items uploaded by other staff.
        if not _is_admin(db, current_staff):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own uploads")
        # Admin override requires explicit permission.
        perms = StaffRBACService.get_user_permission_keys(db, current_staff.id)
        if not StaffRBACService.has_permission(perms, "library.delete_any") and not StaffRBACService.has_permission(perms, "*"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        admin_override = True

    item.is_deleted = True
    item.deleted_at = datetime.utcnow()
    item.deleted_by_staff_user_id = int(current_staff.id)
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="library.soft_delete",
            entity="staff_library_items",
            entity_id=str(item.id),
            details={
                "admin_override": bool(admin_override),
                "owner_staff_user_id": int(item.staff_user_id) if item.staff_user_id is not None else None,
                "kind": item.kind,
                "folder": item.folder,
                "title": item.title,
                "url": item.url,
                "deleted_at": item.deleted_at.isoformat() if item.deleted_at else None,
            },
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}


@router.post("/items/{item_id}/restore")
def restore_item(
    request: Request,
    item_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("library.delete_any")),
):
    if not _is_admin(db, current_staff):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    item = db.query(StaffLibraryItem).filter(StaffLibraryItem.id == int(item_id)).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not item.is_deleted:
        return {"ok": True}

    before = {
        "is_deleted": bool(item.is_deleted),
        "deleted_at": item.deleted_at.isoformat() if item.deleted_at else None,
        "deleted_by_staff_user_id": item.deleted_by_staff_user_id,
    }
    item.is_deleted = False
    item.deleted_at = None
    item.deleted_by_staff_user_id = None
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="library.restore",
            entity="staff_library_items",
            entity_id=str(item.id),
            details={
                "before": before,
                "after": {"is_deleted": False},
                "kind": item.kind,
                "folder": item.folder,
                "title": item.title,
                "url": item.url,
            },
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}


@router.delete("/items/{item_id}/purge")
def purge_item(
    request: Request,
    item_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("admin.manage")),
):
    # Only admin can permanently delete.
    if not _is_admin(db, current_staff):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    item = db.query(StaffLibraryItem).filter(StaffLibraryItem.id == int(item_id)).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    file_deleted, file_error = _delete_remote_file(item)

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="library.purge",
            entity="staff_library_items",
            entity_id=str(item.id),
            details={
                "kind": item.kind,
                "folder": item.folder,
                "title": item.title,
                "url": item.url,
                "file_deleted": bool(file_deleted),
                "file_error": file_error,
                "was_soft_deleted": bool(item.is_deleted),
            },
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )

    # Always remove DB row to fulfill admin intent; file deletion is best-effort and reported.
    db.delete(item)
    db.commit()
    return {"ok": True, "file_deleted": bool(file_deleted), "file_error": file_error}
