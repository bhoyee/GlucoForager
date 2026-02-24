"""Add premium access block fields.

Revision ID: 20260224_0003
Revises: 20260222_0002
Create Date: 2026-02-24
"""

from alembic import op
import sqlalchemy as sa


revision = "20260224_0003"
down_revision = "20260222_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("premium_access_blocked_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("premium_access_blocked_until", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("premium_access_blocked_reason", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "premium_access_blocked_reason")
    op.drop_column("users", "premium_access_blocked_until")
    op.drop_column("users", "premium_access_blocked_at")

