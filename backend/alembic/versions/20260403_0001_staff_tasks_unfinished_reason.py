"""staff tasks: unfinished reason fields

Revision ID: 20260403_0001
Revises: 20260402_0003
Create Date: 2026-04-03
"""

from alembic import op
import sqlalchemy as sa


revision = "20260403_0001"
down_revision = "20260402_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff_assigned_tasks", sa.Column("unfinished_reason", sa.String(), nullable=True))
    op.add_column("staff_assigned_tasks", sa.Column("unfinished_at", sa.DateTime(), nullable=True))
    op.add_column(
        "staff_assigned_tasks",
        sa.Column("unfinished_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
    )
    op.create_index(
        "ix_staff_assigned_tasks_unfinished_by_staff_user_id",
        "staff_assigned_tasks",
        ["unfinished_by_staff_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_staff_assigned_tasks_unfinished_by_staff_user_id", table_name="staff_assigned_tasks")
    op.drop_column("staff_assigned_tasks", "unfinished_by_staff_user_id")
    op.drop_column("staff_assigned_tasks", "unfinished_at")
    op.drop_column("staff_assigned_tasks", "unfinished_reason")

