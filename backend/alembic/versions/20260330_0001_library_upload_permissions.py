"""restrict library upload permission by role

Revision ID: 20260330_0001
Revises: 20260329_0005
Create Date: 2026-03-30
"""

from alembic import op
import sqlalchemy as sa


revision = "20260330_0001"
down_revision = "20260329_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure HR can upload assets, and remove upload from roles that shouldn't.
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = 'library.upload'
            WHERE r.key = 'hr'
            ON CONFLICT DO NOTHING
            """
        )
    )

    op.execute(
        sa.text(
            """
            DELETE FROM staff_role_permissions rp
            USING staff_roles r, staff_permissions p
            WHERE rp.role_id = r.id
              AND rp.permission_id = p.id
              AND r.key IN ('marketer', 'support', 'developer')
              AND p.key = 'library.upload'
            """
        )
    )


def downgrade() -> None:
    # Best-effort rollback: re-add upload to marketer; remove from HR.
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = 'library.upload'
            WHERE r.key = 'marketer'
            ON CONFLICT DO NOTHING
            """
        )
    )

    op.execute(
        sa.text(
            """
            DELETE FROM staff_role_permissions rp
            USING staff_roles r, staff_permissions p
            WHERE rp.role_id = r.id
              AND rp.permission_id = p.id
              AND r.key = 'hr'
              AND p.key = 'library.upload'
            """
        )
    )

