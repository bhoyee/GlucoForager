"""add recipe safety flags

Revision ID: 20260605_0001
Revises: 20260604_0001
Create Date: 2026-06-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260605_0001"
down_revision = "20260604_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("safety_flags", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("recipes", "safety_flags")
