"""staff bank details

Revision ID: 20260401_0002
Revises: 20260401_0001
Create Date: 2026-04-01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260401_0002"
down_revision = "20260401_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff_users", sa.Column("bank_name", sa.String(length=120), nullable=True))
    op.add_column("staff_users", sa.Column("bank_account_number", sa.String(length=64), nullable=True))
    op.add_column("staff_users", sa.Column("bank_account_name", sa.String(length=160), nullable=True))


def downgrade() -> None:
    op.drop_column("staff_users", "bank_account_name")
    op.drop_column("staff_users", "bank_account_number")
    op.drop_column("staff_users", "bank_name")

