"""meal_log_entries: add source/carbs_g/calories fields for barcode-sourced entries

Revision ID: 20260907_0003
Revises: 20260907_0002
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260907_0003"
down_revision = "20260907_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meal_log_entries",
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
    )
    op.add_column("meal_log_entries", sa.Column("carbs_g", sa.Float(), nullable=True))
    op.add_column("meal_log_entries", sa.Column("calories", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("meal_log_entries", "calories")
    op.drop_column("meal_log_entries", "carbs_g")
    op.drop_column("meal_log_entries", "source")
