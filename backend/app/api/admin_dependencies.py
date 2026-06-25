from datetime import datetime
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from ..core.security import decode_access_token
from ..database import get_db
from ..models.admin_user import AdminUser
from ..models.staff_user import StaffUser
from ..services.staff_rbac_service import StaffRBACService

DEMO_ROLE_KEYS = {"demo_admin", "demo"}
DEMO_ALLOWED_METHODS = {"GET", "HEAD", "OPTIONS"}
DEMO_ALLOWED_PREFIXES = (
    "users",
    "recipes",
    "uploads",
    "tips",
    "challenge",
    "blog",
    "newsletter",
    "user-email",
    "email-campaigns",
    "notifications",
    "push-campaigns",
    "system-health",
    "health",
    "system-logs",
    "mobile-logs",
    "db-backups",
    "backups",
    "ai",
    "revenuecat",
    "me",
)


def _is_demo_staff(db: Session, staff: StaffUser | None) -> bool:
    if not staff:
        return False
    role_keys = {str(k).strip().lower() for k in StaffRBACService.get_user_role_keys(db, int(staff.id))}
    return bool(role_keys.intersection(DEMO_ROLE_KEYS))


def _mark_demo_state(request: Request, *, is_demo: bool) -> None:
    try:
        request.state.is_demo_admin = bool(is_demo)
    except Exception:
        pass


def _enforce_demo_read_only(request: Request, *, subpath: str | None = None) -> None:
    method = (request.method or "GET").upper()
    if method not in DEMO_ALLOWED_METHODS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Demo mode is read-only. Actions are disabled for portfolio walkthroughs.")
    if subpath is not None:
        cleaned = str(subpath or "").lstrip("/")
        if not cleaned:
            return
        if not any(cleaned == prefix or cleaned.startswith(f"{prefix}/") for prefix in DEMO_ALLOWED_PREFIXES):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This area is not available in demo mode.")


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

    is_demo = _is_demo_staff(db, staff)
    _mark_demo_state(request, is_demo=is_demo)
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
        is_demo = _is_demo_staff(db, staff)
        _mark_demo_state(request, is_demo=is_demo)
        if is_demo:
            subpath = str(request.url.path or "")
            subpath = subpath[len("/api/admin/") :] if subpath.startswith("/api/admin/") else None
            _enforce_demo_read_only(request, subpath=subpath)
            try:
                request.state.staff_permissions = perm_keys
            except Exception:
                pass
            return staff
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
        if staff and _is_demo_staff(db, staff):
            admin = AdminUser(id=0, email=str(staff.email).lower(), hashed_password="demo-read-only")
        else:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")

    # RBAC is anchored on StaffUser (matched by email) even though we return AdminUser for legacy endpoints.
    if not staff:
        staff = db.query(StaffUser).filter(StaffUser.email == str(admin.email).lower()).first()
    if not StaffRBACService.is_active_staff(staff):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or inactive staff token")

    is_demo = _is_demo_staff(db, staff)
    _mark_demo_state(request, is_demo=is_demo)
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
        method = (request.method or "GET").upper()
        # staff management (future): staff.manage
        if subpath.startswith("staff"):
            required = "staff.manage"
        elif subpath.startswith("users"):
            required = "users.read" if method == "GET" else "users.write"
        elif subpath.startswith("recipes"):
            required = "recipes.write"
        elif subpath.startswith("uploads"):
            required = "recipes.write"
        elif subpath.startswith("tips"):
            required = "tips.write"
        elif subpath.startswith("challenge"):
            required = "challenge.write"
        elif subpath.startswith("blog"):
            required = "blog.read" if method == "GET" else "blog.write"
        elif subpath.startswith("newsletter"):
            required = "newsletter.send"
        elif subpath.startswith("push-campaigns") or subpath.startswith("notifications"):
            required = "push.send"
        elif subpath.startswith("settings"):
            required = "system.read"
        elif subpath.startswith("ai") or subpath.startswith("revenuecat"):
            required = "system.read"
        elif subpath.startswith("email-campaigns"):
            required = "email.send"
        elif subpath.startswith("mobile-logs") or subpath.startswith("system-logs"):
            required = "logs.read"
        elif subpath.startswith("system-health") or subpath.startswith("health"):
            required = "system.read"
        elif subpath.startswith("db-backups") or subpath.startswith("backups"):
            required = "backups.run"
        elif subpath.startswith("user-email"):
            required = "email.send"

    if is_demo:
        subpath = path[len("/api/admin/") :] if path.startswith("/api/admin/") else None
        _enforce_demo_read_only(request, subpath=subpath)
        perm_keys = StaffRBACService.get_user_permission_keys(db, staff.id)  # type: ignore[arg-type]
        try:
            request.state.staff_permissions = perm_keys
        except Exception:
            pass
    elif required:
        perm_keys = StaffRBACService.get_user_permission_keys(db, staff.id)  # type: ignore[arg-type]
        if not StaffRBACService.has_permission(perm_keys, required):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        try:
            request.state.staff_permissions = perm_keys
        except Exception:
            pass

    # touch last_login_at (best-effort)
    try:
        if staff and not staff.last_login_at:
            staff.last_login_at = datetime.utcnow()
            db.commit()
    except Exception:
        db.rollback()

    return admin
