"""add user food profile fields

Revision ID: 20260314_0001
Revises: 20260313_0001
Create Date: 2026-03-14 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260314_0001"
down_revision = "20260313_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("blood_sugar_profile", sa.String(), nullable=True))
    op.add_column("users", sa.Column("country_code", sa.String(length=2), nullable=True))
    op.add_column("users", sa.Column("preferred_cuisines", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("meal_goals", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("dietary_pattern", sa.String(), nullable=True))
    op.add_column("users", sa.Column("allergens", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("food_exclusions", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("available_equipment", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("cook_time_preference", sa.String(), nullable=True))
    # Nullable so existing users aren't forced into onboarding. New users will be set explicitly.
    op.add_column("users", sa.Column("profile_completed", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "profile_completed")
    op.drop_column("users", "cook_time_preference")
    op.drop_column("users", "available_equipment")
    op.drop_column("users", "food_exclusions")
    op.drop_column("users", "allergens")
    op.drop_column("users", "dietary_pattern")
    op.drop_column("users", "meal_goals")
    op.drop_column("users", "preferred_cuisines")
    op.drop_column("users", "country_code")
    op.drop_column("users", "blood_sugar_profile")
