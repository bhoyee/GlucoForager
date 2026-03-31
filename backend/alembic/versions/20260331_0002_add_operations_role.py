"""add operations role

Revision ID: 20260331_0002
Revises: 20260331_0001
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa


revision = "20260331_0002"
down_revision = "20260331_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO staff_roles (key, name, description, created_at) VALUES (:k,:n,:d, now()) ON CONFLICT (key) DO NOTHING"
        ).bindparams(
            k="operations",
            n="Operations",
            d="Operations role (expenses, reports, attendance, work logs)",
        )
    )

    # Give operations a sensible default permission set.
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = ANY(:perm_keys)
            WHERE r.key = 'operations'
            ON CONFLICT DO NOTHING
            """
        ).bindparams(
            perm_keys=[
                "reports.read",
                "expenses.read",
                "expenses.write",
                "attendance.read",
                "attendance.write",
                "work_logs.read",
                "work_logs.write",
                "library.read",
                "tickets.read",
                "tickets.write",
                "tickets.close",
                "notifications.read",
            ]
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM staff_role_permissions
            WHERE role_id IN (SELECT id FROM staff_roles WHERE key='operations')
            """
        )
    )
    op.execute(sa.text("DELETE FROM staff_roles WHERE key='operations'"))

