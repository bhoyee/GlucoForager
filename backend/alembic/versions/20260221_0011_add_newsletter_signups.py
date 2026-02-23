"""add newsletter signups

Revision ID: 20260221_0011
Revises: 20260221_0010
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260221_0011"
down_revision = "20260221_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "newsletter_signups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_newsletter_signups_email", "newsletter_signups", ["email"], unique=True)
    op.create_index("ix_newsletter_signups_status", "newsletter_signups", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_newsletter_signups_status", table_name="newsletter_signups")
    op.drop_index("ix_newsletter_signups_email", table_name="newsletter_signups")
    op.drop_table("newsletter_signups")

