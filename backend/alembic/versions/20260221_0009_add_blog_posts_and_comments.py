"""add blog posts and comments

Revision ID: 20260221_0009
Revises: 20260204_0008
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260221_0009"
down_revision = "20260204_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "blog_posts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("excerpt", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("author_name", sa.String(), nullable=True),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_blog_posts_slug", "blog_posts", ["slug"], unique=True)
    op.create_index("ix_blog_posts_status", "blog_posts", ["status"], unique=False)
    op.create_index("ix_blog_posts_published_at", "blog_posts", ["published_at"], unique=False)

    op.create_table(
        "blog_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("blog_posts.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_blog_comments_post_id", "blog_comments", ["post_id"], unique=False)
    op.create_index("ix_blog_comments_status", "blog_comments", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_blog_comments_status", table_name="blog_comments")
    op.drop_index("ix_blog_comments_post_id", table_name="blog_comments")
    op.drop_table("blog_comments")

    op.drop_index("ix_blog_posts_published_at", table_name="blog_posts")
    op.drop_index("ix_blog_posts_status", table_name="blog_posts")
    op.drop_index("ix_blog_posts_slug", table_name="blog_posts")
    op.drop_table("blog_posts")

