from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...core.security import get_password_hash
from ...database import get_db
from ...models.staff_permission import StaffPermission
from ...models.staff_role import StaffRole
from ...models.staff_user import StaffUser
from ...services.staff_rbac_service import StaffRBACService


router = APIRouter(prefix="/admin", tags=["admin-staff"])


class StaffMeResponse(BaseModel):
    id: int
    email: EmailStr
    timezone: str
    is_active: bool
    roles: list[str]
    permissions: list[str]


class StaffUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=256)
    timezone: str = Field("UTC", max_length=64)
    is_active: bool = True
    role_keys: list[str] = Field(default_factory=list, max_length=12)


class StaffUserUpdate(BaseModel):
    timezone: str | None = Field(None, max_length=64)
    is_active: bool | None = None


class StaffUserOut(BaseModel):
    id: int
    email: EmailStr
    timezone: str
    is_active: bool
    roles: list[str]
    created_at: datetime | None = None


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
    current_staff: StaffUser = Depends(get_current_admin),
):
    roles = StaffRBACService.get_user_role_keys(db, current_staff.id)
    perms = StaffRBACService.get_user_permission_keys(db, current_staff.id)
    return StaffMeResponse(
        id=current_staff.id,
        email=current_staff.email,
        timezone=current_staff.timezone,
        is_active=bool(current_staff.is_active),
        roles=roles,
        permissions=perms,
    )


@router.get("/staff/users", response_model=dict)
def list_staff_users(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),  # noqa: ARG001
):
    users = db.query(StaffUser).order_by(StaffUser.created_at.desc()).all()
    items: list[dict] = []
    for u in users:
        items.append(
            StaffUserOut(
                id=u.id,
                email=u.email,
                timezone=u.timezone,
                is_active=bool(u.is_active),
                roles=StaffRBACService.get_user_role_keys(db, u.id),
                created_at=u.created_at,
            ).model_dump()
        )
    return {"items": items}


@router.post("/staff/users", response_model=StaffUserOut)
def create_staff_user(
    payload: StaffUserCreate,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),  # noqa: ARG001
):
    email = payload.email.lower()
    existing = db.query(StaffUser).filter(StaffUser.email == email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Staff user already exists")

    user = StaffUser(
        email=email,
        hashed_password=get_password_hash(payload.password),
        timezone=(payload.timezone or "UTC").strip()[:64] or "UTC",
        is_active=bool(payload.is_active),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
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
        roles=StaffRBACService.get_user_role_keys(db, user.id),
        created_at=user.created_at,
    )


@router.patch("/staff/users/{user_id}", response_model=StaffUserOut)
def update_staff_user(
    user_id: int,
    payload: StaffUserUpdate,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),  # noqa: ARG001
):
    user = db.query(StaffUser).filter(StaffUser.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")

    if payload.timezone is not None:
        user.timezone = payload.timezone.strip()[:64] or user.timezone
    if payload.is_active is not None:
        user.is_active = bool(payload.is_active)

    db.commit()
    db.refresh(user)
    return StaffUserOut(
        id=user.id,
        email=user.email,
        timezone=user.timezone,
        is_active=bool(user.is_active),
        roles=StaffRBACService.get_user_role_keys(db, user.id),
        created_at=user.created_at,
    )


@router.post("/staff/users/{user_id}/roles", response_model=dict)
def set_staff_user_roles(
    user_id: int,
    payload: SetRoleKeysPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),  # noqa: ARG001
):
    user = db.query(StaffUser).filter(StaffUser.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")
    StaffRBACService.set_user_roles_by_keys(db, user.id, payload.role_keys)
    db.commit()
    return {"ok": True, "roles": StaffRBACService.get_user_role_keys(db, user.id)}


@router.get("/staff/roles", response_model=dict)
def list_roles(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),  # noqa: ARG001
):
    roles = db.query(StaffRole).order_by(StaffRole.key.asc()).all()
    return {"items": [StaffRoleOut(id=r.id, key=r.key, name=r.name, description=r.description).model_dump() for r in roles]}


@router.post("/staff/roles", response_model=StaffRoleOut)
def create_role(
    payload: StaffRoleCreate,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),  # noqa: ARG001
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
    current_staff: StaffUser = Depends(get_current_admin),  # noqa: ARG001
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
    current_staff: StaffUser = Depends(get_current_admin),  # noqa: ARG001
):
    role = db.query(StaffRole).filter(StaffRole.id == int(role_id)).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    StaffRBACService.set_role_permissions_by_keys(db, role.id, payload.permission_keys)
    db.commit()
    return {"ok": True}

