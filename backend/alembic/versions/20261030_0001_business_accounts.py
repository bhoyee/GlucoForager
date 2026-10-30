"""business accounts: income records and receipts on expenses

Revision ID: 20261030_0001
Revises: 20261026_0001
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa


revision = "20261030_0001"
down_revision = "20261026_0001"
branch_labels = None
depends_on = None

_RECEIPT_COLUMNS = ("storage_backend", "remote_dir", "filename", "original_name", "content_type")


def upgrade() -> None:
    op.create_table(
        "business_income",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("income_date", sa.Date(), nullable=False),
        sa.Column("source", sa.String(), nullable=False, server_default="other"),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="GBP"),
        sa.Column("amount_gbp", sa.Numeric(12, 2), nullable=True),
        sa.Column("exchange_rate_to_gbp", sa.Numeric(18, 8), nullable=True),
        sa.Column("exchange_rate_source", sa.String(), nullable=True),
        sa.Column("converted_at", sa.DateTime(), nullable=True),
        sa.Column("note", sa.String(), nullable=True),
        *[sa.Column(f"document_{name}", sa.String(), nullable=True) for name in _RECEIPT_COLUMNS],
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_business_income_id", "business_income", ["id"])
    op.create_index("ix_business_income_income_date", "business_income", ["income_date"])
    op.create_index("ix_business_income_created_by_staff_user_id", "business_income", ["created_by_staff_user_id"])

    for name in _RECEIPT_COLUMNS:
        op.add_column("staff_expenses", sa.Column(f"receipt_{name}", sa.String(), nullable=True))


def downgrade() -> None:
    for name in _RECEIPT_COLUMNS:
        op.drop_column("staff_expenses", f"receipt_{name}")
    op.drop_index("ix_business_income_created_by_staff_user_id", table_name="business_income")
    op.drop_index("ix_business_income_income_date", table_name="business_income")
    op.drop_index("ix_business_income_id", table_name="business_income")
    op.drop_table("business_income")
