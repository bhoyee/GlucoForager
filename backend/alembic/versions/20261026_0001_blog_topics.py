"""blog_topics: researched keyword topics for the blog autopilot

Revision ID: 20261026_0001
Revises: 20261025_0001
Create Date: 2026-10-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20261026_0001"
down_revision = "20261025_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "blog_topics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("week_of", sa.Date(), nullable=False),
        sa.Column("keyword", sa.String(), nullable=False),
        sa.Column("title_idea", sa.String(), nullable=True),
        sa.Column("angle", sa.String(), nullable=True),
        sa.Column("questions", sa.JSON(), nullable=True),
        sa.Column("related", sa.JSON(), nullable=True),
        sa.Column("signals", sa.JSON(), nullable=True),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="reserve"),
        sa.Column("planned_for", sa.Date(), nullable=True),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("blog_posts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_blog_topics_week_of", "blog_topics", ["week_of"])
    op.create_index("ix_blog_topics_status", "blog_topics", ["status"])
    op.create_index("ix_blog_topics_planned_for", "blog_topics", ["planned_for"])


def downgrade() -> None:
    op.drop_table("blog_topics")
