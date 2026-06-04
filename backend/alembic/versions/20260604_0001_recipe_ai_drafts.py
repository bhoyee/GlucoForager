"""add recipe draft workflow fields

Revision ID: 20260604_0001
Revises: 20260603_0001
Create Date: 2026-06-04
"""

from alembic import op
import sqlalchemy as sa


revision = "20260604_0001"
down_revision = "20260603_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("status", sa.String(), nullable=False, server_default="published"))
    op.add_column("recipes", sa.Column("source", sa.String(), nullable=False, server_default="manual"))
    op.add_column("recipes", sa.Column("generated_by_admin_user_id", sa.Integer(), nullable=True))
    op.add_column("recipes", sa.Column("image_prompt", sa.String(), nullable=True))
    op.alter_column("recipes", "image_url", existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE recipes SET image_url = '' WHERE image_url IS NULL")
    op.alter_column("recipes", "image_url", existing_type=sa.String(), nullable=False)
    op.drop_column("recipes", "image_prompt")
    op.drop_column("recipes", "generated_by_admin_user_id")
    op.drop_column("recipes", "source")
    op.drop_column("recipes", "status")
