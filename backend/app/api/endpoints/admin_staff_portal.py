from __future__ import annotations

from datetime import datetime

import os
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_staff_user, require_staff_permission
from ...core.security import get_password_hash
from ...database import get_db
from ...models.admin_user import AdminUser
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_permission import StaffPermission
from ...models.staff_role import StaffRole
from ...models.staff_user import StaffUser
from ...services.staff_rbac_service import StaffRBACService
from ...core.country_codes import ISO_COUNTRY_CODES


router = APIRouter(prefix="/admin", tags=["admin-staff"])


def _clean_text(value: str | None, *, max_len: int, allow_newlines: bool = False) -> str | None:
    if value is None:
        return None
    text = str(value)
    text = text.replace("\x00", "")
    text = text.strip()
    if not allow_newlines:
        text = " ".join(text.split())
    if not text:
        return None
    return text[: int(max_len)]


def _normalize_country(code: str | None) -> str | None:
    if code is None:
        return None
    cleaned = str(code).strip().upper()
    if not cleaned:
        return None
    if len(cleaned) != 2 or not cleaned.isalpha():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid country code")
    if cleaned not in ISO_COUNTRY_CODES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid country code")
    return cleaned


class StaffMeResponse(BaseModel):
    id: int
    email: EmailStr
    timezone: str
    is_active: bool
    full_name: str | None = None
    country: str | None = None
    address: str | None = None
    phone_number: str | None = None
    gender: str | None = None
    avatar_url: str | None = None
    roles: list[str]
    permissions: list[str]


class StaffUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=256)
    full_name: str | None = Field(None, max_length=160)
    country: str | None = Field(None, min_length=2, max_length=2)  # ISO alpha-2 (e.g. "US", "GB")
    timezone: str = Field("UTC", max_length=64)
    is_active: bool = True
    role_keys: list[str] = Field(default_factory=list, max_length=12)


class StaffUserUpdate(BaseModel):
    timezone: str | None = Field(None, max_length=64)
    is_active: bool | None = None
    full_name: str | None = Field(None, max_length=160)
    country: str | None = Field(None, min_length=2, max_length=2)  # ISO alpha-2


class StaffUserOut(BaseModel):
    id: int
    email: EmailStr
    timezone: str
    is_active: bool
    full_name: str | None = None
    country: str | None = None
    avatar_url: str | None = None
    roles: list[str]
    created_at: datetime | None = None
    deleted_at: datetime | None = None


class StaffRoleCreate(BaseModel):
    key: str = Field(..., min_length=2, max_length=64)
    name: str = Field(..., min_length=2, max_length=120)
    description: str | None = Field(None, max_length=240)


class StaffRoleOut(BaseModel):
    id: int
    key: str
    name: str
    description: str | None = None


class StaffPermissionOut(BaseModel):
    id: int
    key: str
    name: str
    description: str | None = None


class SetRoleKeysPayload(BaseModel):
    role_keys: list[str] = Field(default_factory=list, max_length=12)


class SetPermissionKeysPayload(BaseModel):
    permission_keys: list[str] = Field(default_factory=list, max_length=64)


@router.get("/me", response_model=StaffMeResponse)
def admin_me(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),
):
    roles = StaffRBACService.get_user_role_keys(db, current_staff.id)
    perms = StaffRBACService.get_user_permission_keys(db, current_staff.id)
    return StaffMeResponse(
        id=current_staff.id,
        email=current_staff.email,
        timezone=current_staff.timezone,
        is_active=bool(current_staff.is_active),
        full_name=getattr(current_staff, "full_name", None),
        country=getattr(current_staff, "country", None),
        address=getattr(current_staff, "address", None),
        phone_number=getattr(current_staff, "phone_number", None),
        gender=getattr(current_staff, "gender", None),
        avatar_url=getattr(current_staff, "avatar_url", None),
        roles=roles,
        permissions=perms,
    )


@router.get("/staff/users", response_model=dict)
def list_staff_users(
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("staff.manage")),  # noqa: ARG001
):
    q = db.query(StaffUser)
    if not include_deleted:
        q = q.filter(StaffUser.deleted_at.is_(None))
    users = q.order_by(StaffUser.created_at.desc()).all()
    items: list[dict] = []
    for u in users:
        items.append(
            StaffUserOut(
                id=u.id,
                email=u.email,
                timezone=u.timezone,
                is_active=bool(u.is_active),
                full_name=getattr(u, "full_name", None),
                country=getattr(u, "country", None),
                avatar_url=getattr(u, "avatar_url", None),
                roles=StaffRBACService.get_user_role_keys(db, u.id),
                created_at=u.created_at,
                deleted_at=getattr(u, "deleted_at", None),
            ).model_dump()
        )
    return {"items": items}


@router.get("/staff/team", response_model=dict)
def list_staff_team(
    q: str | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("staff.team.read")),  # noqa: ARG001
):
    """
    Lightweight team directory for staff (name + email + roles).
    Does not expose sensitive profile fields.
    """

    query = db.query(StaffUser).filter(StaffUser.deleted_at.is_(None), StaffUser.is_active.is_(True))
    if q:
        needle = str(q).strip().lower()
        if needle:
            like = f"%{needle}%"
            query = query.filter(
                (StaffUser.email.ilike(like))
                | (StaffUser.full_name.ilike(like))  # type: ignore[arg-type]
            )

    users = query.order_by(StaffUser.full_name.asc().nullslast(), StaffUser.email.asc()).limit(500).all()
    items: list[dict] = []
    for u in users:
        items.append(
            {
                "id": int(u.id),
                "full_name": getattr(u, "full_name", None),
                "email": u.email,
                "roles": StaffRBACService.get_user_role_keys(db, u.id),
            }
        )
    return {"items": items}


@router.post("/staff/users", response_model=StaffUserOut)
def create_staff_user(
    payload: StaffUserCreate,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("staff.manage")),  # noqa: ARG001
):
    email = payload.email.lower()
    existing_staff = db.query(StaffUser).filter(StaffUser.email == email).first()
    existing_admin = db.query(AdminUser).filter(AdminUser.email == email).first()
    if existing_staff or existing_admin:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Staff user already exists")

    hashed = get_password_hash(payload.password)
    user = StaffUser(
        email=email,
        hashed_password=hashed,
        full_name=_clean_text(payload.full_name, max_len=160),
        country=_normalize_country(payload.country),
        timezone=(payload.timezone or "UTC").strip()[:64] or "UTC",
        is_active=bool(payload.is_active),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    admin = AdminUser(email=email, hashed_password=hashed)
    db.add(admin)
    db.add(user)
    db.commit()
    db.refresh(user)

    if payload.role_keys:
        StaffRBACService.set_user_roles_by_keys(db, user.id, payload.role_keys)
        db.commit()

    return StaffUserOut(
        id=user.id,
        email=user.email,
        timezone=user.timezone,
        is_active=bool(user.is_active),
        full_name=getattr(user, "full_name", None),
        country=getattr(user, "country", None),
        avatar_url=getattr(user, "avatar_url", None),
        roles=StaffRBACService.get_user_role_keys(db, user.id),
        created_at=user.created_at,
    )


@router.patch("/staff/users/{user_id}", response_model=StaffUserOut)
def update_staff_user(
    request: Request,
    user_id: int,
    payload: StaffUserUpdate,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("staff.manage")),
):
    user = db.query(StaffUser).filter(StaffUser.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")
    if getattr(user, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Staff user is deleted")

    if payload.timezone is not None:
        user.timezone = payload.timezone.strip()[:64] or user.timezone
    if payload.is_active is not None:
        if int(user.id) == int(current_staff.id) and not bool(payload.is_active):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot disable your own account")
        user.is_active = bool(payload.is_active)

    if payload.full_name is not None:
        user.full_name = _clean_text(payload.full_name, max_len=160)
    if payload.country is not None:
        user.country = _normalize_country(payload.country)

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="staff.update",
            entity="staff_users",
            entity_id=str(user.id),
            details={
                "timezone": user.timezone,
                "is_active": bool(user.is_active),
            },
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent") if request.headers else None,
            created_at=datetime.utcnow(),
        )
    )

    db.commit()
    db.refresh(user)
    return StaffUserOut(
        id=user.id,
        email=user.email,
        timezone=user.timezone,
        is_active=bool(user.is_active),
        full_name=getattr(user, "full_name", None),
        country=getattr(user, "country", None),
        avatar_url=getattr(user, "avatar_url", None),
        roles=StaffRBACService.get_user_role_keys(db, user.id),
        created_at=user.created_at,
        deleted_at=getattr(user, "deleted_at", None),
    )


class StaffProfileOut(BaseModel):
    id: int
    email: EmailStr
    timezone: str
    full_name: str | None = None
    country: str | None = None
    address: str | None = None
    phone_number: str | None = None
    gender: str | None = None
    next_of_kin_name: str | None = None
    next_of_kin_contact: str | None = None
    next_of_kin_relationship: str | None = None
    next_of_kin_address: str | None = None
    avatar_url: str | None = None


class StaffProfileUpdatePayload(BaseModel):
    full_name: str | None = Field(None, max_length=160)
    country: str | None = Field(None, min_length=2, max_length=2)  # ISO alpha-2
    address: str | None = Field(None, max_length=240)
    phone_number: str | None = Field(None, max_length=32)
    gender: str | None = Field(None, max_length=32)
    next_of_kin_name: str | None = Field(None, max_length=160)
    next_of_kin_contact: str | None = Field(None, max_length=64)
    next_of_kin_relationship: str | None = Field(None, max_length=64)
    next_of_kin_address: str | None = Field(None, max_length=240)


@router.get("/staff/profile/me", response_model=StaffProfileOut)
def get_my_profile(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),
):
    return StaffProfileOut(
        id=int(current_staff.id),
        email=current_staff.email,
        timezone=current_staff.timezone,
        full_name=getattr(current_staff, "full_name", None),
        country=getattr(current_staff, "country", None),
        address=getattr(current_staff, "address", None),
        phone_number=getattr(current_staff, "phone_number", None),
        gender=getattr(current_staff, "gender", None),
        next_of_kin_name=getattr(current_staff, "next_of_kin_name", None),
        next_of_kin_contact=getattr(current_staff, "next_of_kin_contact", None),
        next_of_kin_relationship=getattr(current_staff, "next_of_kin_relationship", None),
        next_of_kin_address=getattr(current_staff, "next_of_kin_address", None),
        avatar_url=getattr(current_staff, "avatar_url", None),
    )


@router.patch("/staff/profile/me", response_model=StaffProfileOut)
def update_my_profile(
    request: Request,
    payload: StaffProfileUpdatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),
):
    if payload.full_name is not None:
        current_staff.full_name = _clean_text(payload.full_name, max_len=160)
    if payload.country is not None:
        current_staff.country = _normalize_country(payload.country)
    if payload.address is not None:
        current_staff.address = _clean_text(payload.address, max_len=240, allow_newlines=True)
    if payload.phone_number is not None:
        current_staff.phone_number = _clean_text(payload.phone_number, max_len=32)
    if payload.gender is not None:
        g = _clean_text(payload.gender, max_len=32)
        allowed = {"female", "male", "non_binary", "other"}
        current_staff.gender = (g if g in allowed else None) if g is not None else None
    if payload.next_of_kin_name is not None:
        current_staff.next_of_kin_name = _clean_text(payload.next_of_kin_name, max_len=160)
    if payload.next_of_kin_contact is not None:
        current_staff.next_of_kin_contact = _clean_text(payload.next_of_kin_contact, max_len=64)
    if payload.next_of_kin_relationship is not None:
        rel = _clean_text(payload.next_of_kin_relationship, max_len=64)
        allowed_rel = {"parent", "spouse", "sibling", "partner", "friend", "other"}
        current_staff.next_of_kin_relationship = (rel if rel in allowed_rel else None) if rel is not None else None
    if payload.next_of_kin_address is not None:
        current_staff.next_of_kin_address = _clean_text(payload.next_of_kin_address, max_len=240, allow_newlines=True)

    # Enforce required profile fields (keep next-of-kin optional).
    required_missing: list[str] = []
    if not _clean_text(getattr(current_staff, "full_name", None), max_len=160):
        required_missing.append("full_name")
    if not _normalize_country(getattr(current_staff, "country", None)):
        required_missing.append("country")
    if not _clean_text(getattr(current_staff, "address", None), max_len=240, allow_newlines=True):
        required_missing.append("address")
    if not _clean_text(getattr(current_staff, "phone_number", None), max_len=32):
        required_missing.append("phone_number")
    if not _clean_text(getattr(current_staff, "gender", None), max_len=32):
        required_missing.append("gender")

    if required_missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Missing required profile fields: {', '.join(required_missing)}",
        )

    current_staff.updated_at = datetime.utcnow()
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="staff.profile.updated",
            entity="staff_users",
            entity_id=str(current_staff.id),
            details={"fields": [k for k, v in payload.model_dump().items() if v is not None]},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent") if request.headers else None,
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(current_staff)
    return get_my_profile(db=db, current_staff=current_staff)


@router.post("/staff/profile/avatar", response_model=dict)
def upload_profile_avatar(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff_user),
):
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type")
    extension = os.path.splitext(file.filename or "")[1].lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image type")

    from ...core.config import settings  # local import to avoid circular imports

    subdir = os.path.join(settings.uploads_dir, "profiles")
    os.makedirs(subdir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    destination = os.path.join(subdir, filename)
    with open(destination, "wb") as target:
        target.write(file.file.read())

    base_url = str(request.base_url).rstrip("/")
    url = f"{base_url}/uploads/profiles/{filename}"
    current_staff.avatar_url = url
    current_staff.updated_at = datetime.utcnow()

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="staff.profile.avatar_uploaded",
            entity="staff_users",
            entity_id=str(current_staff.id),
            details={"avatar_url": url},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent") if request.headers else None,
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True, "avatar_url": url}


@router.post("/staff/users/{user_id}/roles", response_model=dict)
def set_staff_user_roles(
    request: Request,
    user_id: int,
    payload: SetRoleKeysPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("staff.manage")),  # noqa: ARG001
):
    user = db.query(StaffUser).filter(StaffUser.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")
    if getattr(user, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Staff user is deleted")
    StaffRBACService.set_user_roles_by_keys(db, user.id, payload.role_keys)
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="staff.roles.set",
            entity="staff_users",
            entity_id=str(user.id),
            details={"role_keys": [str(k) for k in (payload.role_keys or [])]},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent") if request.headers else None,
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True, "roles": StaffRBACService.get_user_role_keys(db, user.id)}


class StaffUserDeletePayload(BaseModel):
    reason: str | None = Field(None, max_length=240)


@router.delete("/staff/users/{user_id}", response_model=dict)
def soft_delete_staff_user(
    request: Request,
    user_id: int,
    payload: StaffUserDeletePayload | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("staff.manage")),
):
    user = db.query(StaffUser).filter(StaffUser.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")
    if int(user.id) == int(current_staff.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot delete your own account")
    if getattr(user, "deleted_at", None) is not None:
        return {"ok": True}

    reason = None
    if payload and isinstance(payload.reason, str) and payload.reason.strip():
        reason = payload.reason.strip()[:240]

    user.is_active = False
    user.deleted_at = datetime.utcnow()
    user.deleted_by_staff_user_id = int(current_staff.id)
    user.delete_reason = reason

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="staff.soft_delete",
            entity="staff_users",
            entity_id=str(user.id),
            details={"reason": reason},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent") if request.headers else None,
            created_at=datetime.utcnow(),
        )
    )

    db.commit()
    return {"ok": True}


@router.get("/staff/roles", response_model=dict)
def list_roles(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("staff.manage")),  # noqa: ARG001
):
    roles = db.query(StaffRole).order_by(StaffRole.key.asc()).all()
    return {"items": [StaffRoleOut(id=r.id, key=r.key, name=r.name, description=r.description).model_dump() for r in roles]}


@router.post("/staff/roles", response_model=StaffRoleOut)
def create_role(
    payload: StaffRoleCreate,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("staff.manage")),  # noqa: ARG001
):
    key = payload.key.strip().lower()
    if not key or " " in key:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid role key")
    existing = db.query(StaffRole).filter(StaffRole.key == key).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role already exists")

    role = StaffRole(key=key, name=payload.name.strip(), description=(payload.description or None), created_at=datetime.utcnow())
    db.add(role)
    db.commit()
    db.refresh(role)
    return StaffRoleOut(id=role.id, key=role.key, name=role.name, description=role.description)


@router.get("/staff/permissions", response_model=dict)
def list_permissions(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("staff.manage")),  # noqa: ARG001
):
    perms = db.query(StaffPermission).order_by(StaffPermission.key.asc()).all()
    return {
        "items": [
            StaffPermissionOut(id=p.id, key=p.key, name=p.name, description=p.description).model_dump()
            for p in perms
        ]
    }


@router.post("/staff/roles/{role_id}/permissions", response_model=dict)
def set_role_permissions(
    role_id: int,
    payload: SetPermissionKeysPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("staff.manage")),  # noqa: ARG001
):
    role = db.query(StaffRole).filter(StaffRole.id == int(role_id)).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    StaffRBACService.set_role_permissions_by_keys(db, role.id, payload.permission_keys)
    db.commit()
    return {"ok": True}
