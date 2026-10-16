"""free tier: weekly AI usage counters + welcome-week email tracking

Revision ID: 20261016_0001
Revises: 20260922_0002
Create Date: 2026-10-16
"""

from alembic import op
import sqlalchemy as sa


revision = "20261016_0001"
down_revision = "20260922_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feature_usage_weekly",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("feature", sa.String(), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("user_id", "feature", "week_start", name="uq_feature_usage_user_feature_week"),
    )
    op.create_index("ix_feature_usage_weekly_id", "feature_usage_weekly", ["id"])
    op.create_index("ix_feature_usage_weekly_user_id", "feature_usage_weekly", ["user_id"])

    # Welcome-week lifecycle emails (day 5 reminder, day 7 "what's still free").
    op.add_column("users", sa.Column("welcome_reminder_email_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("welcome_ended_email_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "welcome_ended_email_at")
    op.drop_column("users", "welcome_reminder_email_at")
    op.drop_index("ix_feature_usage_weekly_user_id", table_name="feature_usage_weekly")
    op.drop_index("ix_feature_usage_weekly_id", table_name="feature_usage_weekly")
    op.drop_table("feature_usage_weekly")
