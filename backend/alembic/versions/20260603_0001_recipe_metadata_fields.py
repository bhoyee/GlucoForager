"""add recipe metadata fields

Revision ID: 20260603_0001
Revises: 20260515_0001
Create Date: 2026-06-03
"""

from alembic import op
import sqlalchemy as sa


revision = "20260603_0001"
down_revision = "20260515_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("cuisine_tags", sa.JSON(), nullable=True))
    op.add_column("recipes", sa.Column("dietary_tags", sa.JSON(), nullable=True))
    op.add_column("recipes", sa.Column("allergen_tags", sa.JSON(), nullable=True))
    op.add_column("recipes", sa.Column("food_exclusion_tags", sa.JSON(), nullable=True))
    op.add_column("recipes", sa.Column("goal_tags", sa.JSON(), nullable=True))
    op.add_column("recipes", sa.Column("equipment_tags", sa.JSON(), nullable=True))
    op.add_column("recipes", sa.Column("diabetes_type_tags", sa.JSON(), nullable=True))
    op.add_column("recipes", sa.Column("cook_time_tag", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("recipes", "cook_time_tag")
    op.drop_column("recipes", "diabetes_type_tags")
    op.drop_column("recipes", "equipment_tags")
    op.drop_column("recipes", "goal_tags")
    op.drop_column("recipes", "food_exclusion_tags")
    op.drop_column("recipes", "allergen_tags")
    op.drop_column("recipes", "dietary_tags")
    op.drop_column("recipes", "cuisine_tags")
