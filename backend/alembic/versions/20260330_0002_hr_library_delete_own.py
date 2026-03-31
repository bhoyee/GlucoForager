"""hr can soft-delete own library uploads (reason required)

Revision ID: 20260330_0002
Revises: 20260330_0001
Create Date: 2026-03-30
"""

from alembic import op
import sqlalchemy as sa


revision = "20260330_0002"
down_revision = "20260330_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure HR can soft-delete their own uploads.
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = 'library.delete_own'
            WHERE r.key = 'hr'
            ON CONFLICT DO NOTHING
            """
        )
    )

    # Make sure HR cannot delete other people's uploads (defense-in-depth).
    op.execute(
        sa.text(
            """
            DELETE FROM staff_role_permissions rp
            USING staff_roles r, staff_permissions p
            WHERE rp.role_id = r.id
              AND rp.permission_id = p.id
              AND r.key = 'hr'
              AND p.key = 'library.delete_any'
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM staff_role_permissions rp
            USING staff_roles r, staff_permissions p
            WHERE rp.role_id = r.id
              AND rp.permission_id = p.id
              AND r.key = 'hr'
              AND p.key = 'library.delete_own'
            """
        )
    )

