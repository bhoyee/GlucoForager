"""add blog post image url

Revision ID: 20260222_0001
Revises: 20260221_0011
Create Date: 2026-02-22
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260222_0001"
down_revision = "20260221_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("blog_posts", sa.Column("image_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("blog_posts", "image_url")

