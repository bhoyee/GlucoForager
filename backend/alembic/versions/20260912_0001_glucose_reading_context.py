"""glucose_readings: add context tag (fasting/before_meal/after_meal/bedtime)

Revision ID: 20260912_0001
Revises: 20260908_0001
Create Date: 2026-09-12
"""

from alembic import op
import sqlalchemy as sa


revision = "20260912_0001"
down_revision = "20260908_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("glucose_readings", sa.Column("context", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("glucose_readings", "context")
