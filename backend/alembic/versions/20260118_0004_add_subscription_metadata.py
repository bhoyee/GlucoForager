"""add subscription metadata fields

Revision ID: 20260118_0004
Revises: 20260112_0003
Create Date: 2026-01-18 00:00:04.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260118_0004"
down_revision = "20260112_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("transaction_id", sa.String(), nullable=True))
    op.add_column("subscriptions", sa.Column("original_transaction_id", sa.String(), nullable=True))
    op.add_column("subscriptions", sa.Column("product_id", sa.String(), nullable=True))
    op.add_column("subscriptions", sa.Column("store", sa.String(), nullable=True))
    op.add_column("subscriptions", sa.Column("environment", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("subscriptions", "environment")
    op.drop_column("subscriptions", "store")
    op.drop_column("subscriptions", "product_id")
    op.drop_column("subscriptions", "original_transaction_id")
    op.drop_column("subscriptions", "transaction_id")
