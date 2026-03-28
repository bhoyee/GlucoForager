"""blog phase 9: comment moderation fields for audit trail

Revision ID: 20260328_0018
Revises: 20260328_0017
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0018"
down_revision = "20260328_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("blog_comments", sa.Column("moderated_at", sa.DateTime(), nullable=True))
    op.add_column("blog_comments", sa.Column("moderated_by_staff_user_id", sa.Integer(), nullable=True))
    op.add_column("blog_comments", sa.Column("moderation_action", sa.String(), nullable=True))
    op.add_column("blog_comments", sa.Column("moderation_note", sa.String(), nullable=True))

    op.create_index("ix_blog_comments_moderated_at", "blog_comments", ["moderated_at"], unique=False)
    op.create_index("ix_blog_comments_moderated_by_staff_user_id", "blog_comments", ["moderated_by_staff_user_id"], unique=False)
    op.create_index("ix_blog_comments_moderation_action", "blog_comments", ["moderation_action"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_blog_comments_moderation_action", table_name="blog_comments")
    op.drop_index("ix_blog_comments_moderated_by_staff_user_id", table_name="blog_comments")
    op.drop_index("ix_blog_comments_moderated_at", table_name="blog_comments")

    op.drop_column("blog_comments", "moderation_note")
    op.drop_column("blog_comments", "moderation_action")
    op.drop_column("blog_comments", "moderated_by_staff_user_id")
    op.drop_column("blog_comments", "moderated_at")

