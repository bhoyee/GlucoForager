"""add blog_posts.all_users_notified_at

Revision ID: 20260901_0001
Revises: 20260723_0001
Create Date: 2026-09-01
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260901_0001"
down_revision = "20260723_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("blog_posts", sa.Column("all_users_notified_at", sa.DateTime(), nullable=True))
    op.create_index(
        "ix_blog_posts_all_users_notified_at", "blog_posts", ["all_users_notified_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_blog_posts_all_users_notified_at", table_name="blog_posts")
    op.drop_column("blog_posts", "all_users_notified_at")
