from __future__ import annotations

from typing import Iterable

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..models.staff_user import StaffUser


class StaffRBACService:
    @staticmethod
    def get_user_role_keys(db: Session, user_id: int) -> list[str]:
        rows = db.execute(
            text(
                """
                SELECT r.key
                FROM staff_user_roles ur
                JOIN staff_roles r ON r.id = ur.role_id
                WHERE ur.user_id = :uid
                """
            ),
            {"uid": int(user_id)},
        ).fetchall()
        return [str(r[0]) for r in rows if r and r[0]]

    @staticmethod
    def get_user_permission_keys(db: Session, user_id: int) -> list[str]:
        rows = db.execute(
            text(
                """
                SELECT DISTINCT p.key
                FROM staff_user_roles ur
                JOIN staff_role_permissions rp ON rp.role_id = ur.role_id
                JOIN staff_permissions p ON p.id = rp.permission_id
                WHERE ur.user_id = :uid
                """
            ),
            {"uid": int(user_id)},
        ).fetchall()
        return [str(r[0]) for r in rows if r and r[0]]

    @staticmethod
    def set_user_roles_by_keys(db: Session, user_id: int, role_keys: Iterable[str]) -> None:
        keys = [str(k).strip().lower() for k in (role_keys or []) if str(k).strip()]
        # Resolve role ids by key; ignore unknown keys.
        role_rows = db.execute(
            text("SELECT id, key FROM staff_roles WHERE key = ANY(:keys)"),
            {"keys": keys},
        ).fetchall() if keys else []
        role_ids = [int(r[0]) for r in role_rows if r and r[0] is not None]

        db.execute(text("DELETE FROM staff_user_roles WHERE user_id = :uid"), {"uid": int(user_id)})
        for rid in role_ids:
            db.execute(
                text("INSERT INTO staff_user_roles (user_id, role_id) VALUES (:uid,:rid) ON CONFLICT DO NOTHING"),
                {"uid": int(user_id), "rid": int(rid)},
            )

    @staticmethod
    def set_role_permissions_by_keys(db: Session, role_id: int, permission_keys: Iterable[str]) -> None:
        keys = [str(k).strip() for k in (permission_keys or []) if str(k).strip()]
        perm_rows = db.execute(
            text("SELECT id, key FROM staff_permissions WHERE key = ANY(:keys)"),
            {"keys": keys},
        ).fetchall() if keys else []
        perm_ids = [int(r[0]) for r in perm_rows if r and r[0] is not None]

        db.execute(text("DELETE FROM staff_role_permissions WHERE role_id = :rid"), {"rid": int(role_id)})
        for pid in perm_ids:
            db.execute(
                text("INSERT INTO staff_role_permissions (role_id, permission_id) VALUES (:rid,:pid) ON CONFLICT DO NOTHING"),
                {"rid": int(role_id), "pid": int(pid)},
            )

    @staticmethod
    def has_permission(permission_keys: Iterable[str], required: str) -> bool:
        if not required:
            return True
        keys = {str(k) for k in (permission_keys or []) if k}
        if "*" in keys:
            return True
        return required in keys

    @staticmethod
    def ensure_permission(permission_keys: Iterable[str], required: str) -> None:
        if not StaffRBACService.has_permission(permission_keys, required):
            raise PermissionError("Permission denied")

    @staticmethod
    def is_active_staff(user: StaffUser | None) -> bool:
        return bool(user and user.is_active and user.email)
