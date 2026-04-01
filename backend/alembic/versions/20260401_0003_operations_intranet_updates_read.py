"""operations intranet updates read

Revision ID: 20260401_0003
Revises: 20260401_0002
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_0003"
down_revision = "20260401_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Allow Operations role to see the intranet updates ticker on the staff dashboard.
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = 'intranet_updates.read'
            WHERE r.key = 'operations'
            ON CONFLICT DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM staff_role_permissions rp
            WHERE rp.role_id IN (SELECT id FROM staff_roles WHERE key='operations')
              AND rp.permission_id IN (SELECT id FROM staff_permissions WHERE key='intranet_updates.read')
            """
        )
    )

