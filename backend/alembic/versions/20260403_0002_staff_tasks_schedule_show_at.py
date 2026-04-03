"""staff tasks: schedule show_at

Revision ID: 20260403_0002
Revises: 20260403_0001
Create Date: 2026-04-03
"""

from alembic import op
import sqlalchemy as sa


revision = "20260403_0002"
down_revision = "20260403_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff_assigned_tasks", sa.Column("show_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("staff_assigned_tasks", sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_staff_assigned_tasks_show_at", "staff_assigned_tasks", ["show_at"], unique=False)
    op.create_index("ix_staff_assigned_tasks_notified_at", "staff_assigned_tasks", ["notified_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_staff_assigned_tasks_notified_at", table_name="staff_assigned_tasks")
    op.drop_index("ix_staff_assigned_tasks_show_at", table_name="staff_assigned_tasks")
    op.drop_column("staff_assigned_tasks", "notified_at")
    op.drop_column("staff_assigned_tasks", "show_at")

