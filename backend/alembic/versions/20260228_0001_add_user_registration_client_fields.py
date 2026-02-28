"""Add user registration client fields.

Revision ID: 20260228_0001
Revises: 20260224_0003
Create Date: 2026-02-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260228_0001"
down_revision = "20260224_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("registered_platform", sa.String(), nullable=True))
    op.add_column("users", sa.Column("registered_app_version", sa.String(), nullable=True))
    op.add_column("users", sa.Column("registered_build_number", sa.String(), nullable=True))
    op.add_column("users", sa.Column("registered_os_version", sa.String(), nullable=True))
    op.add_column("users", sa.Column("registered_device_model", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "registered_device_model")
    op.drop_column("users", "registered_os_version")
    op.drop_column("users", "registered_build_number")
    op.drop_column("users", "registered_app_version")
    op.drop_column("users", "registered_platform")

