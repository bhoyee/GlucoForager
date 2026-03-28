from __future__ import annotations

import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
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


@router.get("")
def list_library(
    folder: str | None = None,
    include_deleted: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("library.read")),
):
    q = db.query(StaffLibraryItem)
    if folder:
        q = q.filter(StaffLibraryItem.folder == folder)
    if not include_deleted:
        q = q.filter(StaffLibraryItem.is_deleted.is_(False))
    else:
        if not _is_admin(db, current_staff):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    q = q.order_by(StaffLibraryItem.created_at.desc())
    items = q.all()
    return {
        "items": [
            {
                "id": i.id,
                "staff_user_id": i.staff_user_id,
                "kind": i.kind,
                "folder": i.folder,
                "title": i.title,
                "url": i.url,
                "is_deleted": bool(i.is_deleted),
                "deleted_at": i.deleted_at.isoformat() if i.deleted_at else None,
                "deleted_by_staff_user_id": i.deleted_by_staff_user_id,
                "created_at": i.created_at.isoformat() if i.created_at else None,
            }
            for i in items
        ]
    }


@router.post("/upload")
def upload_to_library(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    folder: str = Form("general"),
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
        folder=(folder or "general").strip()[:40] or "general",
        title=title.strip()[:160] or (file.filename or "Untitled")[:160],
        url=url,
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
