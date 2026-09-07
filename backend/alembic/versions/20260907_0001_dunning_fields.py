"""users: dunning/win-back email sequence fields

Revision ID: 20260907_0001
Revises: 20260901_0001
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260907_0001"
down_revision = "20260901_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("dunning_started_at", sa.DateTime(), nullable=True))
    op.add_column(
        "users",
        sa.Column("dunning_emails_sent", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("users", sa.Column("last_dunning_email_at", sa.DateTime(), nullable=True))
    op.add_column(
        "users",
        sa.Column("dunning_opt_out", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("users", "dunning_opt_out")
    op.drop_column("users", "last_dunning_email_at")
    op.drop_column("users", "dunning_emails_sent")
    op.drop_column("users", "dunning_started_at")
