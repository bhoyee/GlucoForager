from __future__ import annotations

from functools import lru_cache
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

