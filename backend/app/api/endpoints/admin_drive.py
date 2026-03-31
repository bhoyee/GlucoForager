from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_staff_user, require_staff_permission
from ...database import get_db
from ...models.staff_drive_event import StaffDriveEvent
from ...models.staff_drive_file import StaffDriveFile
from ...models.staff_user import StaffUser
from ...services.drive_storage_service import delete_drive_object, load_drive_bytes, store_drive_upload
from ...services.staff_rbac_service import StaffRBACService


router = APIRouter(prefix="/admin/drive", tags=["admin-drive"])


def _now() -> datetime:
    return datetime.utcnow()


def _log_event(db: Session, *, file_id: int, actor_id: int | None, action: str, details: dict | None = None) -> None:
    db.add(
        StaffDriveEvent(
            drive_file_id=int(file_id),
            actor_id=int(actor_id) if actor_id is not None else None,
            action=str(action),
            details=details or None,
            created_at=_now(),
        )
    )


def _file_to_dict(db: Session, f: StaffDriveFile) -> dict:
    uploader = db.query(StaffUser).filter(StaffUser.id == int(f.staff_user_id)).first()
    deleted_by = db.query(StaffUser).filter(StaffUser.id == int(f.deleted_by_staff_user_id)).first() if f.deleted_by_staff_user_id else None
    return {
        "id": int(f.id),
        "owner_id": int(f.staff_user_id),
        "owner_email": uploader.email if uploader else None,
        "title": f.title,
        "original_filename": f.original_filename,
        "content_type": f.content_type,
        "size_bytes": f.size_bytes,
        "is_deleted": bool(f.is_deleted),
        "deleted_at": f.deleted_at.isoformat() if f.deleted_at else None,
        "deleted_by": deleted_by.email if deleted_by else None,
        "delete_reason": f.delete_reason,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


def _get_owned_file_or_404(db: Session, *, file_id: int, owner_id: int) -> StaffDriveFile:
    f = db.query(StaffDriveFile).filter(StaffDriveFile.id == int(file_id), StaffDriveFile.staff_user_id == int(owner_id)).first()
    if not f:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return f


def _get_file_or_404(db: Session, *, file_id: int) -> StaffDriveFile:
    f = db.query(StaffDriveFile).filter(StaffDriveFile.id == int(file_id)).first()
    if not f:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return f


@router.get("/my/files", response_model=dict)
def list_my_files(
    q: str | None = None,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),
):
    query = db.query(StaffDriveFile).filter(StaffDriveFile.staff_user_id == int(current_staff.id))
    if not include_deleted:
        query = query.filter(StaffDriveFile.is_deleted.is_(False))
    if q:
        needle = str(q).strip()
        if needle:
            like = f"%{needle}%"
            query = query.filter((StaffDriveFile.title.ilike(like)) | (StaffDriveFile.original_filename.ilike(like)))
    files = query.order_by(StaffDriveFile.created_at.desc().nullslast(), StaffDriveFile.id.desc()).limit(500).all()
    return {"items": [_file_to_dict(db, f) for f in files]}


@router.post("/my/upload", response_model=dict)
def upload_my_file(
    request: Request,
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),
):
    clean_title = str(title or "").strip()
    if not clean_title:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Title is required")
    if len(clean_title) > 160:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Title is too long")

    try:
        stored = store_drive_upload(staff_user_id=int(current_staff.id), file=file)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e

    row = StaffDriveFile(
        staff_user_id=int(current_staff.id),
        title=clean_title,
        original_filename=(file.filename or None),
        content_type=(file.content_type or None),
        size_bytes=stored.size_bytes,
        storage_backend=stored.storage_backend,
        remote_dir=stored.remote_dir,
        filename=stored.filename,
        is_deleted=False,
        created_at=_now(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    _log_event(
        db,
        file_id=int(row.id),
        actor_id=int(current_staff.id),
        action="upload",
        details={
            "title": clean_title,
            "original_filename": file.filename,
            "content_type": file.content_type,
            "size_bytes": stored.size_bytes,
            "ip": request.client.host if request.client else None,
        },
    )
    db.commit()

    return {"ok": True, "item": _file_to_dict(db, row)}


@router.post("/my/files/{file_id}/soft-delete", response_model=dict)
def soft_delete_my_file(
    file_id: int,
    reason: str | None = Form(None),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),
):
    f = _get_owned_file_or_404(db, file_id=int(file_id), owner_id=int(current_staff.id))
    if f.is_deleted:
        return {"ok": True}
    r = str(reason or "").strip()
    if r and len(r) > 280:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Reason is too long")

    f.is_deleted = True
    f.deleted_at = _now()
    f.deleted_by_staff_user_id = int(current_staff.id)
    f.delete_reason = r or None
    db.add(f)
    _log_event(db, file_id=int(f.id), actor_id=int(current_staff.id), action="soft_delete", details={"reason": r} if r else None)
    db.commit()
    return {"ok": True}


@router.post("/my/files/{file_id}/restore", response_model=dict)
def restore_my_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),
):
    f = _get_owned_file_or_404(db, file_id=int(file_id), owner_id=int(current_staff.id))
    if not f.is_deleted:
        return {"ok": True}
    f.is_deleted = False
    f.deleted_at = None
    f.deleted_by_staff_user_id = None
    f.delete_reason = None
    db.add(f)
    _log_event(db, file_id=int(f.id), actor_id=int(current_staff.id), action="restore")
    db.commit()
    return {"ok": True}


def _serve_file(*, db: Session, f: StaffDriveFile, actor_id: int, mode: str) -> Response:
    if f.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    data = load_drive_bytes(storage_backend=f.storage_backend, remote_dir=f.remote_dir, filename=f.filename)
    content_type = str(f.content_type or "application/octet-stream")

    disp_mode = "attachment" if mode == "download" else "inline"
    name = str(f.original_filename or f.title or f.filename).replace("\n", " ").replace("\r", " ").strip()
    if not name:
        name = f.filename

    _log_event(db, file_id=int(f.id), actor_id=int(actor_id), action=mode)
    db.commit()

    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'{disp_mode}; filename="{name}"'},
    )


@router.get("/my/files/{file_id}/download")
def download_my_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),
):
    f = _get_owned_file_or_404(db, file_id=int(file_id), owner_id=int(current_staff.id))
    return _serve_file(db=db, f=f, actor_id=int(current_staff.id), mode="download")


@router.get("/my/files/{file_id}/preview")
def preview_my_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),
):
    f = _get_owned_file_or_404(db, file_id=int(file_id), owner_id=int(current_staff.id))
    return _serve_file(db=db, f=f, actor_id=int(current_staff.id), mode="preview")


# Admin: staff-wide view (StaffDrive)
@router.get("/staff/files", response_model=dict)
def list_staff_files(
    q: str | None = None,
    owner_id: int | None = None,
    include_deleted: bool = True,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("admin.manage")),  # noqa: ARG001
):
    query = db.query(StaffDriveFile)
    if owner_id is not None:
        query = query.filter(StaffDriveFile.staff_user_id == int(owner_id))
    if not include_deleted:
        query = query.filter(StaffDriveFile.is_deleted.is_(False))
    if q:
        needle = str(q).strip()
        if needle:
            like = f"%{needle}%"
            query = query.filter((StaffDriveFile.title.ilike(like)) | (StaffDriveFile.original_filename.ilike(like)))
    files = query.order_by(StaffDriveFile.created_at.desc().nullslast(), StaffDriveFile.id.desc()).limit(1000).all()
    return {"items": [_file_to_dict(db, f) for f in files]}


@router.get("/staff/files/{file_id}/details", response_model=dict)
def staff_file_details(
    file_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("admin.manage")),  # noqa: ARG001
):
    f = _get_file_or_404(db, file_id=int(file_id))
    events = (
        db.query(StaffDriveEvent)
        .filter(StaffDriveEvent.drive_file_id == int(f.id))
        .order_by(StaffDriveEvent.created_at.asc().nullslast(), StaffDriveEvent.id.asc())
        .all()
    )

    def actor_label(actor_id: int | None) -> str | None:
        if not actor_id:
            return None
        u = db.query(StaffUser).filter(StaffUser.id == int(actor_id)).first()
        if not u:
            return None
        roles = StaffRBACService.get_user_role_keys(db, u.id)
        role = str(roles[0]) if roles else ""
        return f"{getattr(u, 'full_name', None) or u.email} ({role})"

    return {
        "item": _file_to_dict(db, f),
        "events": [
            {
                "id": int(e.id),
                "action": e.action,
                "actor": actor_label(e.actor_id),
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
    }


@router.post("/staff/files/{file_id}/soft-delete", response_model=dict)
def soft_delete_staff_file(
    file_id: int,
    reason: str = Form(...),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("admin.manage")),
):
    f = _get_file_or_404(db, file_id=int(file_id))
    if f.is_deleted:
        return {"ok": True}
    r = str(reason or "").strip()
    if not r:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Reason is required")
    if len(r) > 280:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Reason is too long")

    f.is_deleted = True
    f.deleted_at = _now()
    f.deleted_by_staff_user_id = int(current_staff.id)
    f.delete_reason = r
    db.add(f)
    _log_event(db, file_id=int(f.id), actor_id=int(current_staff.id), action="soft_delete", details={"reason": r})
    db.commit()
    return {"ok": True}


@router.post("/staff/files/{file_id}/restore", response_model=dict)
def restore_staff_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("admin.manage")),
):
    f = _get_file_or_404(db, file_id=int(file_id))
    if not f.is_deleted:
        return {"ok": True}
    f.is_deleted = False
    f.deleted_at = None
    f.deleted_by_staff_user_id = None
    f.delete_reason = None
    db.add(f)
    _log_event(db, file_id=int(f.id), actor_id=int(current_staff.id), action="restore")
    db.commit()
    return {"ok": True}


@router.get("/staff/files/{file_id}/download")
def download_staff_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("admin.manage")),
):
    f = _get_file_or_404(db, file_id=int(file_id))
    return _serve_file(db=db, f=f, actor_id=int(current_staff.id), mode="download")


@router.get("/staff/files/{file_id}/preview")
def preview_staff_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("admin.manage")),
):
    f = _get_file_or_404(db, file_id=int(file_id))
    return _serve_file(db=db, f=f, actor_id=int(current_staff.id), mode="preview")


@router.delete("/staff/files/{file_id}", response_model=dict)
def purge_staff_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("admin.manage")),
):
    f = _get_file_or_404(db, file_id=int(file_id))
    # Remove remote object first (best effort).
    try:
        delete_drive_object(storage_backend=f.storage_backend, remote_dir=f.remote_dir, filename=f.filename)
    except Exception:
        pass
    _log_event(db, file_id=int(f.id), actor_id=int(current_staff.id), action="purge")
    db.delete(f)
    db.commit()
    return {"ok": True}
