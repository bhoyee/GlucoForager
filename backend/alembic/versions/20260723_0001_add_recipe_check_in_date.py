"""add recipe_check_ins.check_in_date + once-per-day unique constraint

Revision ID: 20260723_0001
Revises: 20260722_0001
Create Date: 2026-07-23
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260723_0001"
down_revision = "20260722_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipe_check_ins", sa.Column("check_in_date", sa.Date(), nullable=True))
    op.execute("UPDATE recipe_check_ins SET check_in_date = created_at::date")
    op.alter_column("recipe_check_ins", "check_in_date", nullable=False)
    op.create_unique_constraint(
        "uq_recipe_check_ins_user_fingerprint_date",
        "recipe_check_ins",
        ["user_id", "recipe_fingerprint", "check_in_date"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_recipe_check_ins_user_fingerprint_date", "recipe_check_ins", type_="unique"
    )
    op.drop_column("recipe_check_ins", "check_in_date")
