"""grant payroll.read_own to operations role

Revision ID: 20260401_0004
Revises: 20260401_0003
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_0004"
down_revision = "20260401_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = 'payroll.read_own'
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
              AND permission_id IN (SELECT id FROM staff_permissions WHERE key='payroll.read_own')
            """
        )
    )

