"""staff portal phase 4: attendance approvals + staff soft delete

Revision ID: 20260328_0014
Revises: 20260328_0013
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0014"
down_revision = "20260328_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Attendance approval metadata (HR-approved fixes).
    op.add_column("staff_time_entries", sa.Column("approved_at", sa.DateTime(), nullable=True))
    op.add_column("staff_time_entries", sa.Column("approved_by_staff_user_id", sa.Integer(), nullable=True))
    op.add_column("staff_time_entries", sa.Column("approval_reason", sa.String(), nullable=True))
    op.create_index(
        "ix_staff_time_entries_approved_by_staff_user_id",
        "staff_time_entries",
        ["approved_by_staff_user_id"],
        unique=False,
    )

    # Staff soft delete (HR/admin).
    op.add_column("staff_users", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column("staff_users", sa.Column("deleted_by_staff_user_id", sa.Integer(), nullable=True))
    op.add_column("staff_users", sa.Column("delete_reason", sa.String(), nullable=True))
    op.create_index("ix_staff_users_deleted_at", "staff_users", ["deleted_at"], unique=False)
    op.create_index("ix_staff_users_deleted_by_staff_user_id", "staff_users", ["deleted_by_staff_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_staff_users_deleted_by_staff_user_id", table_name="staff_users")
    op.drop_index("ix_staff_users_deleted_at", table_name="staff_users")
    op.drop_column("staff_users", "delete_reason")
    op.drop_column("staff_users", "deleted_by_staff_user_id")
    op.drop_column("staff_users", "deleted_at")

    op.drop_index("ix_staff_time_entries_approved_by_staff_user_id", table_name="staff_time_entries")
    op.drop_column("staff_time_entries", "approval_reason")
    op.drop_column("staff_time_entries", "approved_by_staff_user_id")
    op.drop_column("staff_time_entries", "approved_at")

