"""staff intranet updates (news) module

Revision ID: 20260329_0001
Revises: 20260328_0021
Create Date: 2026-03-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260329_0001"
down_revision = "20260328_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_intranet_updates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_by_staff_user_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_staff_user_id", sa.Integer(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by_staff_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_intranet_updates_created_at", "staff_intranet_updates", ["created_at"], unique=False)
    op.create_index("ix_staff_intranet_updates_is_deleted", "staff_intranet_updates", ["is_deleted"], unique=False)
    op.create_index("ix_staff_intranet_updates_deleted_at", "staff_intranet_updates", ["deleted_at"], unique=False)
    op.create_index(
        "ix_staff_intranet_updates_created_by_staff_user_id",
        "staff_intranet_updates",
        ["created_by_staff_user_id"],
        unique=False,
    )

    perms = [
        ("intranet_updates.read", "Read intranet updates", "View staff intranet updates/news."),
        ("intranet_updates.write", "Write intranet updates", "Create/edit intranet updates/news."),
        ("intranet_updates.delete", "Delete intranet updates", "Soft-delete intranet updates/news."),
        ("intranet_updates.purge", "Purge intranet updates", "Permanently delete intranet updates/news (admin)."),
    ]
    for key, name, desc in perms:
        op.execute(
            sa.text(
                "INSERT INTO staff_permissions (key, name, description, created_at) VALUES (:k,:n,:d, now()) ON CONFLICT (key) DO NOTHING"
            ).bindparams(k=key, n=name, d=desc)
        )

    # Everyone can read updates; only HR (and admin via '*') can create/edit/delete.
    role_perms: dict[str, list[str]] = {
        "marketer": ["intranet_updates.read"],
        "designer": ["intranet_updates.read"],
        "developer": ["intranet_updates.read"],
        "support": ["intranet_updates.read"],
        "hr": ["intranet_updates.read", "intranet_updates.write", "intranet_updates.delete"],
    }
    for role_key, perm_keys in role_perms.items():
        op.execute(
            sa.text(
                """
                INSERT INTO staff_role_permissions (role_id, permission_id)
                SELECT r.id, p.id
                FROM staff_roles r
                JOIN staff_permissions p ON p.key = ANY(:perm_keys)
                WHERE r.key = :role_key
                ON CONFLICT DO NOTHING
                """
            ).bindparams(role_key=role_key, perm_keys=perm_keys)
        )


def downgrade() -> None:
    op.drop_index("ix_staff_intranet_updates_created_by_staff_user_id", table_name="staff_intranet_updates")
    op.drop_index("ix_staff_intranet_updates_deleted_at", table_name="staff_intranet_updates")
    op.drop_index("ix_staff_intranet_updates_is_deleted", table_name="staff_intranet_updates")
    op.drop_index("ix_staff_intranet_updates_created_at", table_name="staff_intranet_updates")
    op.drop_table("staff_intranet_updates")

    op.execute(
        sa.text("DELETE FROM staff_permissions WHERE key IN (:keys)").bindparams(
            keys=[
                "intranet_updates.read",
                "intranet_updates.write",
                "intranet_updates.delete",
                "intranet_updates.purge",
            ]
        )
    )

