"""add revenue/trial fields to subscription_events, backing the admin Reports > Transactions page

Revision ID: 20260922_0002
Revises: 20260922_0001
Create Date: 2026-09-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260922_0002"
down_revision = "20260922_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscription_events", sa.Column("period_type", sa.String(), nullable=True))
    op.add_column("subscription_events", sa.Column("is_trial_conversion", sa.Boolean(), nullable=True))
    op.add_column("subscription_events", sa.Column("price_usd", sa.Numeric(10, 2), nullable=True))
    op.add_column("subscription_events", sa.Column("price_in_purchased_currency", sa.Numeric(10, 2), nullable=True))
    op.add_column("subscription_events", sa.Column("currency", sa.String(), nullable=True))
    op.add_column("subscription_events", sa.Column("display_type", sa.String(), nullable=True))
    op.create_index("ix_subscription_events_occurred_at", "subscription_events", ["occurred_at"])
    op.create_index("ix_subscription_events_display_type", "subscription_events", ["display_type"])

    # Backfilled rows predate this column - label them distinctly rather than leaving display_type null.
    op.execute(
        "UPDATE subscription_events SET display_type = 'Existing Subscription' "
        "WHERE event_type = 'BACKFILL_EXISTING_STATE' AND display_type IS NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_subscription_events_display_type", table_name="subscription_events")
    op.drop_index("ix_subscription_events_occurred_at", table_name="subscription_events")
    op.drop_column("subscription_events", "display_type")
    op.drop_column("subscription_events", "currency")
    op.drop_column("subscription_events", "price_in_purchased_currency")
    op.drop_column("subscription_events", "price_usd")
    op.drop_column("subscription_events", "is_trial_conversion")
    op.drop_column("subscription_events", "period_type")
