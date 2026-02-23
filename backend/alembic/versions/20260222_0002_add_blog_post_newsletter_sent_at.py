"""add blog post newsletter sent at

Revision ID: 20260222_0002
Revises: 20260222_0001
Create Date: 2026-02-22
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260222_0002"
down_revision = "20260222_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("blog_posts", sa.Column("newsletter_sent_at", sa.DateTime(), nullable=True))
    op.create_index("ix_blog_posts_newsletter_sent_at", "blog_posts", ["newsletter_sent_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_blog_posts_newsletter_sent_at", table_name="blog_posts")
    op.drop_column("blog_posts", "newsletter_sent_at")

