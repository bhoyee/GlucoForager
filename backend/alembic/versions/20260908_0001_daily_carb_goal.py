"""users: add daily_carb_goal_g for the home screen progress ring

Revision ID: 20260908_0001
Revises: 20260907_0003
Create Date: 2026-09-08
"""

from alembic import op
import sqlalchemy as sa


revision = "20260908_0001"
down_revision = "20260907_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("daily_carb_goal_g", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "daily_carb_goal_g")
