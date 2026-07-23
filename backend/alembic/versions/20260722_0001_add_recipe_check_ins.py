"""add recipe_check_ins

Revision ID: 20260722_0001
Revises: 20260626_0001
Create Date: 2026-07-22
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260722_0001"
down_revision = "20260626_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recipe_check_ins",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("recipe_fingerprint", sa.String(), nullable=False),
        sa.Column("recipe_name", sa.String(), nullable=False),
        sa.Column("feeling", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_recipe_check_ins_user_id", "recipe_check_ins", ["user_id"])
    op.create_index("ix_recipe_check_ins_recipe_fingerprint", "recipe_check_ins", ["recipe_fingerprint"])


def downgrade() -> None:
    op.drop_index("ix_recipe_check_ins_recipe_fingerprint", table_name="recipe_check_ins")
    op.drop_index("ix_recipe_check_ins_user_id", table_name="recipe_check_ins")
    op.drop_table("recipe_check_ins")
