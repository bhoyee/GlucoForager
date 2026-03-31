"""payroll run pay date

Revision ID: 20260331_0004
Revises: 20260331_0003
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa


revision = "20260331_0004"
down_revision = "20260331_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payroll_runs", sa.Column("pay_date", sa.Date(), nullable=True))
    op.create_index("ix_payroll_runs_pay_date", "payroll_runs", ["pay_date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_payroll_runs_pay_date", table_name="payroll_runs")
    op.drop_column("payroll_runs", "pay_date")

