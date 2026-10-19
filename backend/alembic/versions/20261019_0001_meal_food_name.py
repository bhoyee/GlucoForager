"""meal_log_entries: food_name (clean dish name) and carbs_estimated

Typed meals now get an estimated carb count and a short standard food name, so they
count toward the carb ring and group properly in Food impact insights.

Revision ID: 20261019_0001
Revises: 20261017_0001
Create Date: 2026-10-19
"""

from alembic import op
import sqlalchemy as sa


revision = "20261019_0001"
down_revision = "20261017_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meal_log_entries", sa.Column("food_name", sa.String(length=80), nullable=True))
    op.add_column(
        "meal_log_entries",
        sa.Column("carbs_estimated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("meal_log_entries", "carbs_estimated")
    op.drop_column("meal_log_entries", "food_name")
