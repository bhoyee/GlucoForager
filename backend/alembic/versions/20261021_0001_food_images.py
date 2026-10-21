"""food_images: shared photo library for swap foods

Revision ID: 20261021_0001
Revises: 20261020_0001
Create Date: 2026-10-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20261021_0001"
down_revision = "20261020_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "food_images",
        sa.Column("key", sa.String(length=80), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="ready"),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="ai"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("food_images")
