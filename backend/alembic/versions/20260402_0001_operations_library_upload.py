"""grant library.upload to operations role

Revision ID: 20260402_0001
Revises: 20260401_0006
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa


revision = "20260402_0001"
down_revision = "20260401_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = 'library.upload'
            WHERE r.key = 'operations'
            ON CONFLICT DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM staff_role_permissions
            WHERE role_id IN (SELECT id FROM staff_roles WHERE key='operations')
              AND permission_id IN (SELECT id FROM staff_permissions WHERE key='library.upload')
            """
        )
    )

