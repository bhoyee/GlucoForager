"""add blog post seo fields

Revision ID: 20260325_0001
Revises: 20260315_0001
Create Date: 2026-03-25
"""

from alembic import op
import sqlalchemy as sa


revision = "20260325_0001"
down_revision = "20260315_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("blog_posts", sa.Column("seo_title", sa.String(), nullable=True))
    op.add_column("blog_posts", sa.Column("seo_description", sa.String(), nullable=True))
    op.add_column("blog_posts", sa.Column("focus_keyword", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("blog_posts", "focus_keyword")
    op.drop_column("blog_posts", "seo_description")
    op.drop_column("blog_posts", "seo_title")
