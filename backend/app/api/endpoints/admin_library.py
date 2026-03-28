from __future__ import annotations

import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...core.config import settings
from ...database import get_db
from ...models.staff_library_item import StaffLibraryItem
from ...models.staff_user import StaffUser
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
        if kind_norm not in {"document", "image"}:
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
    content_type = (file.content_type or "").lower()
    is_image = content_type.startswith("image/")
    allowed_docs = {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    if not is_image and content_type not in allowed_docs:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type")

    extension = os.path.splitext(file.filename or "")[1].lower()
    if is_image and extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image type")
    if (not is_image) and extension not in {".pdf", ".doc", ".docx"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported document type")

    subdir = os.path.join(settings.uploads_dir, "library")
    os.makedirs(subdir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    destination = os.path.join(subdir, filename)
    with open(destination, "wb") as target:
        target.write(file.file.read())

    base_url = str(request.base_url).rstrip("/")
    url = f"{base_url}/uploads/library/{filename}"
    item = StaffLibraryItem(
        staff_user_id=current_staff.id,
        kind="image" if is_image else "document",
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
    db.commit()
    db.refresh(item)
    return {"ok": True, "item": {"id": item.id, "url": item.url}}


@router.delete("/items/{item_id}")
def soft_delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("library.delete_own")),
):
    item = db.query(StaffLibraryItem).filter(StaffLibraryItem.id == int(item_id)).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if item.is_deleted:
        return {"ok": True}

    if int(item.staff_user_id) != int(current_staff.id):
        # Only admins can delete items uploaded by other staff.
        if not _is_admin(db, current_staff):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own uploads")
        # Admin override requires explicit permission.
        perms = StaffRBACService.get_user_permission_keys(db, current_staff.id)
        if not StaffRBACService.has_permission(perms, "library.delete_any") and not StaffRBACService.has_permission(perms, "*"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    item.is_deleted = True
    item.deleted_at = datetime.utcnow()
    item.deleted_by_staff_user_id = int(current_staff.id)
    db.commit()
    return {"ok": True}


@router.post("/items/{item_id}/restore")
def restore_item(
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

    item.is_deleted = False
    item.deleted_at = None
    item.deleted_by_staff_user_id = None
    db.commit()
    return {"ok": True}

