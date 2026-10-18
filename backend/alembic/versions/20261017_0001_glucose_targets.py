"""per-user glucose targets ("My targets"); NULL = ADA defaults

Revision ID: 20261017_0001
Revises: 20261018_0001
Create Date: 2026-10-17
"""

from alembic import op
import sqlalchemy as sa


revision = "20261017_0001"
down_revision = "20261018_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("glucose_target_premeal_low_mgdl", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("glucose_target_premeal_high_mgdl", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("glucose_target_postmeal_high_mgdl", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "glucose_target_postmeal_high_mgdl")
    op.drop_column("users", "glucose_target_premeal_high_mgdl")
    op.drop_column("users", "glucose_target_premeal_low_mgdl")
