"""payroll phase 5: email tracking fields

Revision ID: 20260328_0021
Revises: 20260328_0020
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0021"
down_revision = "20260328_0020"
branch_labels = None
depends_on = None


def _has_column(inspector: sa.Inspector, table: str, column: str) -> bool:
    try:
        cols = inspector.get_columns(table)
    except Exception:
        return False
    return any(str(c.get("name")) == str(column) for c in cols)


def _has_index(inspector: sa.Inspector, table: str, index_name: str) -> bool:
    try:
        idxs = inspector.get_indexes(table)
    except Exception:
        return False
    return any(str(i.get("name")) == str(index_name) for i in idxs)


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if _has_column(inspector, "payroll_items", "emailed_at") is False:
        op.add_column("payroll_items", sa.Column("emailed_at", sa.DateTime(), nullable=True))
    if _has_column(inspector, "payroll_items", "emailed_by_staff_user_id") is False:
        op.add_column("payroll_items", sa.Column("emailed_by_staff_user_id", sa.Integer(), nullable=True))

    if not _has_index(inspector, "payroll_items", "ix_payroll_items_emailed_at"):
        op.create_index("ix_payroll_items_emailed_at", "payroll_items", ["emailed_at"], unique=False)
    if not _has_index(inspector, "payroll_items", "ix_payroll_items_emailed_by_staff_user_id"):
        op.create_index(
            "ix_payroll_items_emailed_by_staff_user_id",
            "payroll_items",
            ["emailed_by_staff_user_id"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index("ix_payroll_items_emailed_by_staff_user_id", table_name="payroll_items")
    op.drop_index("ix_payroll_items_emailed_at", table_name="payroll_items")
    op.drop_column("payroll_items", "emailed_by_staff_user_id")
    op.drop_column("payroll_items", "emailed_at")

