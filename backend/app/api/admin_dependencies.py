from datetime import datetime
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from ..core.security import decode_access_token
from ..database import get_db
from ..models.admin_user import AdminUser
from ..models.staff_user import StaffUser
from ..services.staff_rbac_service import StaffRBACService

admin_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")


def _get_staff_from_token(*, payload: dict, db: Session) -> StaffUser | None:
    kind = payload.get("kind")
    sub = payload.get("sub")
    staff: StaffUser | None = None
    if kind == "staff" and sub:
        try:
            staff = db.query(StaffUser).filter(StaffUser.id == int(sub)).first()
        except Exception:
            staff = None
    return staff


def _get_admin_from_token(*, payload: dict, db: Session) -> AdminUser | None:
    sub = payload.get("sub")
    if payload.get("role") == "admin" and sub:
        try:
            return db.query(AdminUser).filter(AdminUser.id == int(sub)).first()
        except Exception:
            return None
    return None


def get_current_staff_user(
    request: Request,
    db: Session = Depends(get_db),
    token: str = Depends(admin_oauth2_scheme),
) -> StaffUser:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = decode_access_token(token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    staff = _get_staff_from_token(payload=payload, db=db)
    if not staff:
        legacy_admin = _get_admin_from_token(payload=payload, db=db)
        if legacy_admin and legacy_admin.email:
            staff = db.query(StaffUser).filter(StaffUser.email == str(legacy_admin.email).lower()).first()

    if not StaffRBACService.is_active_staff(staff):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or inactive staff token")

    try:
        request.state.staff_user = staff
    except Exception:
        pass

    return staff


def require_staff_permission(required: str):
    def _dep(
        request: Request,
        db: Session = Depends(get_db),
        staff: StaffUser = Depends(get_current_staff_user),
    ) -> StaffUser:
        perm_keys = StaffRBACService.get_user_permission_keys(db, staff.id)
        if not StaffRBACService.has_permission(perm_keys, required):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        try:
            request.state.staff_permissions = perm_keys
        except Exception:
            pass
        return staff

    return _dep


def get_current_admin(
    request: Request,
    db: Session = Depends(get_db),
    token: str = Depends(admin_oauth2_scheme),
) -> AdminUser:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = decode_access_token(token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    admin = _get_admin_from_token(payload=payload, db=db)
    staff = None

    # Transitional support: if token is kind=staff, map to AdminUser by email.
    if not admin:
        staff = _get_staff_from_token(payload=payload, db=db)
        if staff and staff.email:
            admin = db.query(AdminUser).filter(AdminUser.email == str(staff.email).lower()).first()

    if not admin or not admin.email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")

    # RBAC is anchored on StaffUser (matched by email) even though we return AdminUser for legacy endpoints.
    if not staff:
        staff = db.query(StaffUser).filter(StaffUser.email == str(admin.email).lower()).first()
    if not StaffRBACService.is_active_staff(staff):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or inactive staff token")

    try:
        request.state.staff_user = staff
    except Exception:
        pass

    # Basic RBAC guard: require permissions for most admin endpoints.
    # Phase 1 uses coarse-grained permissions based on route prefix.
    path = str(request.url.path or "")
    required = None
    # Public admin endpoints are handled elsewhere (login/bootstrap/status).
    if path.startswith("/api/admin/"):
        subpath = path[len("/api/admin/") :]
        # staff management (future): staff.manage
        if subpath.startswith("staff"):
            required = "staff.manage"
        elif subpath.startswith("users"):
            required = "users.read"
        elif subpath.startswith("recipes"):
            required = "recipes.write"
        elif subpath.startswith("tips"):
            required = "tips.write"
        elif subpath.startswith("challenge"):
            required = "challenge.write"
        elif subpath.startswith("blog"):
            required = "blog.read"
        elif subpath.startswith("newsletter"):
            required = "newsletter.send"
        elif subpath.startswith("push-campaigns") or subpath.startswith("notifications"):
            required = "push.send"
        elif subpath.startswith("mobile-logs") or subpath.startswith("system-logs"):
            required = "logs.read"
        elif subpath.startswith("system-health"):
            required = "system.read"
        elif subpath.startswith("db-backups"):
            required = "backups.run"
        elif subpath.startswith("user-email"):
            required = "email.send"

    if required:
        perm_keys = StaffRBACService.get_user_permission_keys(db, staff.id)  # type: ignore[arg-type]
        if not StaffRBACService.has_permission(perm_keys, required):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    # touch last_login_at (best-effort)
    try:
        if staff and not staff.last_login_at:
            staff.last_login_at = datetime.utcnow()
            db.commit()
    except Exception:
        db.rollback()

    return admin
