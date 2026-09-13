"""add dunning_email_logs - per-send audit trail for the win-back sequence

Revision ID: 20260912_0002
Revises: 20260912_0001
Create Date: 2026-09-12
"""

from alembic import op
import sqlalchemy as sa


revision = "20260912_0002"
down_revision = "20260912_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dunning_email_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("stage", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_dunning_email_logs_user_id", "dunning_email_logs", ["user_id"])
    op.create_index("ix_dunning_email_logs_stage", "dunning_email_logs", ["stage"])
    op.create_index("ix_dunning_email_logs_sent_at", "dunning_email_logs", ["sent_at"])


def downgrade() -> None:
    op.drop_index("ix_dunning_email_logs_sent_at", table_name="dunning_email_logs")
    op.drop_index("ix_dunning_email_logs_stage", table_name="dunning_email_logs")
    op.drop_index("ix_dunning_email_logs_user_id", table_name="dunning_email_logs")
    op.drop_table("dunning_email_logs")
