"""Add app settings table.

Revision ID: 20260228_0002
Revises: 20260228_0001
Create Date: 2026-02-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260228_0002"
down_revision = "20260228_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index(op.f("ix_app_settings_key"), "app_settings", ["key"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_app_settings_key"), table_name="app_settings")
    op.drop_table("app_settings")

