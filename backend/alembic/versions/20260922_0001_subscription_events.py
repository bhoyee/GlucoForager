"""add subscription_events - append-only history behind the admin Transactions view

Subscription rows are mutated in place on every renewal (they track current
state only), so the admin dashboard could only ever show one row per
subscription lineage even after multiple renewals/expirations. This adds an
event log that the webhook appends to instead of overwrites, and backfills
one synthetic row per existing subscription so current data isn't lost.

Revision ID: 20260922_0001
Revises: 20260913_0002
Create Date: 2026-09-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260922_0001"
down_revision = "20260913_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "subscription_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("subscription_id", sa.Integer(), sa.ForeignKey("subscriptions.id"), nullable=True),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("plan", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("transaction_id", sa.String(), nullable=True),
        sa.Column("original_transaction_id", sa.String(), nullable=True),
        sa.Column("product_id", sa.String(), nullable=True),
        sa.Column("store", sa.String(), nullable=True),
        sa.Column("environment", sa.String(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_subscription_events_user_id", "subscription_events", ["user_id"])
    op.create_index("ix_subscription_events_subscription_id", "subscription_events", ["subscription_id"])

    # Backfill one synthetic row per existing subscription so the history view
    # isn't empty for existing users. This reflects current state at migration
    # time, not the real renewal history (which was never recorded).
    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            INSERT INTO subscription_events (
                user_id, subscription_id, event_type, plan, status,
                started_at, expires_at, transaction_id, original_transaction_id,
                product_id, store, environment, occurred_at
            )
            SELECT
                user_id, id, 'BACKFILL_EXISTING_STATE', plan, status,
                started_at, expires_at, transaction_id, original_transaction_id,
                product_id, store, environment, started_at
            FROM subscriptions
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_subscription_events_subscription_id", table_name="subscription_events")
    op.drop_index("ix_subscription_events_user_id", table_name="subscription_events")
    op.drop_table("subscription_events")
