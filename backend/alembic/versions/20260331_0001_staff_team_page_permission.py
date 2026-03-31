"""staff team page permission

Revision ID: 20260331_0001
Revises: 20260330_0004
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa


revision = "20260331_0001"
down_revision = "20260330_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create permission key.
    op.execute(
        sa.text(
            "INSERT INTO staff_permissions (key, name, description, created_at) VALUES (:k,:n,:d, now()) ON CONFLICT (key) DO NOTHING"
        ).bindparams(
            k="staff.team.read",
            n="Read team directory",
            d="View staff directory (name, email, role) in the Staff Portal",
        )
    )

    # Grant it to all roles (admin + staff roles).
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id, created_at)
            SELECT r.id, p.id, now()
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = :perm_key
            ON CONFLICT (role_id, permission_id) DO NOTHING
            """
        ).bindparams(perm_key="staff.team.read")
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM staff_role_permissions
            WHERE permission_id IN (SELECT id FROM staff_permissions WHERE key = :perm_key)
            """
        ).bindparams(perm_key="staff.team.read")
    )
    op.execute(sa.text("DELETE FROM staff_permissions WHERE key = :perm_key").bindparams(perm_key="staff.team.read"))

