"""add demo admin role

Revision ID: 20260625_0001
Revises: 20260624_0001
Create Date: 2026-06-25
"""

from alembic import op
import sqlalchemy as sa


revision = "20260625_0001"
down_revision = "20260624_0001"
branch_labels = None
depends_on = None


DEMO_PERMISSIONS = [
    "users.read",
    "recipes.write",
    "tips.write",
    "challenge.write",
    "blog.read",
    "blog.write",
    "blog.publish",
    "newsletter.send",
    "email.send",
    "push.send",
    "system.read",
    "logs.read",
    "backups.run",
]


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO staff_roles (key, name, description, created_at)
            VALUES ('demo_admin', 'Demo Admin', 'Read-only recruiter and portfolio walkthrough access.', now())
            ON CONFLICT (key) DO NOTHING
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = ANY(:perm_keys)
            WHERE r.key = 'demo_admin'
            ON CONFLICT DO NOTHING
            """
        ).bindparams(sa.bindparam("perm_keys", value=DEMO_PERMISSIONS, type_=sa.ARRAY(sa.String())))
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM staff_role_permissions
            WHERE role_id IN (SELECT id FROM staff_roles WHERE key = 'demo_admin')
            """
        )
    )
    op.execute(sa.text("DELETE FROM staff_roles WHERE key = 'demo_admin'"))
