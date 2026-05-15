"""expense gbp conversion fields

Revision ID: 20260515_0001
Revises: 20260403_0003
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20260515_0001"
down_revision = "20260403_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff_expenses", sa.Column("amount_gbp", sa.Numeric(12, 2), nullable=True))
    op.add_column("staff_expenses", sa.Column("exchange_rate_to_gbp", sa.Numeric(18, 8), nullable=True))
    op.add_column("staff_expenses", sa.Column("exchange_rate_source", sa.String(), nullable=True))
    op.add_column("staff_expenses", sa.Column("converted_at", sa.DateTime(), nullable=True))

    op.execute("UPDATE staff_expenses SET amount_gbp = amount, exchange_rate_to_gbp = 1 WHERE currency = 'GBP'")


def downgrade() -> None:
    op.drop_column("staff_expenses", "converted_at")
    op.drop_column("staff_expenses", "exchange_rate_source")
    op.drop_column("staff_expenses", "exchange_rate_to_gbp")
    op.drop_column("staff_expenses", "amount_gbp")
