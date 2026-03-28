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


def get_current_admin(
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

    # New tokens: kind=staff, sub=<staff_user_id>
    kind = payload.get("kind")
    sub = payload.get("sub")
    staff: StaffUser | None = None
    if kind == "staff" and sub:
        try:
            staff = db.query(StaffUser).filter(StaffUser.id == int(sub)).first()
        except Exception:
            staff = None

    # Backward-compat: old tokens had role=admin, sub=<admin_user_id>. Map by email.
    if not staff and payload.get("role") == "admin" and sub:
        try:
            legacy = db.query(AdminUser).filter(AdminUser.id == int(sub)).first()
        except Exception:
            legacy = None
        if legacy and legacy.email:
            staff = db.query(StaffUser).filter(StaffUser.email == str(legacy.email).lower()).first()

    if not StaffRBACService.is_active_staff(staff):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or inactive staff token")

    # Basic RBAC guard: require permissions for most admin endpoints.
    # Phase 1 uses coarse-grained permissions based on route prefix.
    path = str(request.url.path or "")
    required = None
    # Public admin endpoints are handled elsewhere (login/bootstrap/status).
    if path.startswith("/api/admin/"):
        subpath = path[len("/api/admin/") :]
        # staff management (future): admin.manage
        if subpath.startswith("staff"):
            required = "admin.manage"
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
        perm_keys = StaffRBACService.get_user_permission_keys(db, staff.id)
        if not StaffRBACService.has_permission(perm_keys, required):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    # touch last_login_at (best-effort)
    try:
        if not staff.last_login_at:
            staff.last_login_at = datetime.utcnow()
            db.commit()
    except Exception:
        db.rollback()

    return staff
