"""add user trial access fields

Revision ID: 20260606_0001
Revises: 20260605_0001
Create Date: 2026-06-06
"""

from alembic import op
import sqlalchemy as sa


revision = "20260606_0001"
down_revision = "20260605_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("trial_started_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("trial_ends_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("trial_grace_ends_at", sa.DateTime(), nullable=True))

    # Existing users get a one-time 14-day grace window from migration time.
    # New users receive a normal 7-day trial at signup in the application layer.
    op.execute(
        """
        UPDATE users
        SET trial_grace_ends_at = NOW() + INTERVAL '14 days'
        WHERE trial_grace_ends_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("users", "trial_grace_ends_at")
    op.drop_column("users", "trial_ends_at")
    op.drop_column("users", "trial_started_at")
