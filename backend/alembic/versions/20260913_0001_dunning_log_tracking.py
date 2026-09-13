"""dunning_email_logs: add resend_email_id + open/click tracking columns

Revision ID: 20260913_0001
Revises: 20260912_0002
Create Date: 2026-09-13
"""

from alembic import op
import sqlalchemy as sa


revision = "20260913_0001"
down_revision = "20260912_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dunning_email_logs", sa.Column("resend_email_id", sa.String(), nullable=True))
    op.add_column("dunning_email_logs", sa.Column("opened_at", sa.DateTime(), nullable=True))
    op.add_column("dunning_email_logs", sa.Column("clicked_at", sa.DateTime(), nullable=True))
    op.add_column("dunning_email_logs", sa.Column("clicked_link", sa.String(), nullable=True))
    op.create_index("ix_dunning_email_logs_resend_email_id", "dunning_email_logs", ["resend_email_id"])


def downgrade() -> None:
    op.drop_index("ix_dunning_email_logs_resend_email_id", table_name="dunning_email_logs")
    op.drop_column("dunning_email_logs", "clicked_link")
    op.drop_column("dunning_email_logs", "clicked_at")
    op.drop_column("dunning_email_logs", "opened_at")
    op.drop_column("dunning_email_logs", "resend_email_id")
