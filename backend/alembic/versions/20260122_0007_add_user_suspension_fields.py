"""add user suspension fields

Revision ID: 20260122_0007
Revises: 20260121_0006
Create Date: 2026-01-22 23:05:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260122_0007"
down_revision = "20260121_0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("suspended_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("suspended_reason", sa.String(), nullable=True))


def downgrade():
    op.drop_column("users", "suspended_reason")
    op.drop_column("users", "suspended_at")
