"""add soft delete fields to users

Revision ID: 20260624_0001
Revises: 20260606_0001
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa


revision = "20260624_0001"
down_revision = "20260606_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("deleted_by_admin_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("delete_reason", sa.String(), nullable=True))
    op.create_index("ix_users_deleted_at", "users", ["deleted_at"])
    op.create_index("ix_users_deleted_by_admin_id", "users", ["deleted_by_admin_id"])
    op.create_foreign_key(
        "fk_users_deleted_by_admin_id_admin_users",
        "users",
        "admin_users",
        ["deleted_by_admin_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_deleted_by_admin_id_admin_users", "users", type_="foreignkey")
    op.drop_index("ix_users_deleted_by_admin_id", table_name="users")
    op.drop_index("ix_users_deleted_at", table_name="users")
    op.drop_column("users", "delete_reason")
    op.drop_column("users", "deleted_by_admin_id")
    op.drop_column("users", "deleted_at")