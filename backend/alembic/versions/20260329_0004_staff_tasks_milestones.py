"""staff tasks and role milestones

Revision ID: 20260329_0004
Revises: 20260329_0003
Create Date: 2026-03-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260329_0004"
down_revision = "20260329_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_assigned_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("assigned_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("completion_note", sa.String(), nullable=True),
        sa.Column("proof_links", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_assigned_tasks_staff_user_id", "staff_assigned_tasks", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_assigned_tasks_assigned_by_staff_user_id", "staff_assigned_tasks", ["assigned_by_staff_user_id"], unique=False)
    op.create_index("ix_staff_assigned_tasks_work_date", "staff_assigned_tasks", ["work_date"], unique=False)
    op.create_index("ix_staff_assigned_tasks_is_completed", "staff_assigned_tasks", ["is_completed"], unique=False)
    op.create_index("ix_staff_assigned_tasks_deleted_at", "staff_assigned_tasks", ["deleted_at"], unique=False)

    op.create_table(
        "staff_role_milestones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("role_key", sa.String(), nullable=False),
        sa.Column("cadence", sa.String(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("created_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_role_milestones_role_key", "staff_role_milestones", ["role_key"], unique=False)
    op.create_index("ix_staff_role_milestones_cadence", "staff_role_milestones", ["cadence"], unique=False)
    op.create_index("ix_staff_role_milestones_period_start", "staff_role_milestones", ["period_start"], unique=False)
    op.create_index("ix_staff_role_milestones_period_end", "staff_role_milestones", ["period_end"], unique=False)
    op.create_index("ix_staff_role_milestones_is_completed", "staff_role_milestones", ["is_completed"], unique=False)
    op.create_index("ix_staff_role_milestones_deleted_at", "staff_role_milestones", ["deleted_at"], unique=False)
    op.create_index(
        "ix_staff_role_milestones_created_by_staff_user_id",
        "staff_role_milestones",
        ["created_by_staff_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_staff_role_milestones_created_by_staff_user_id", table_name="staff_role_milestones")
    op.drop_index("ix_staff_role_milestones_deleted_at", table_name="staff_role_milestones")
    op.drop_index("ix_staff_role_milestones_is_completed", table_name="staff_role_milestones")
    op.drop_index("ix_staff_role_milestones_period_end", table_name="staff_role_milestones")
    op.drop_index("ix_staff_role_milestones_period_start", table_name="staff_role_milestones")
    op.drop_index("ix_staff_role_milestones_cadence", table_name="staff_role_milestones")
    op.drop_index("ix_staff_role_milestones_role_key", table_name="staff_role_milestones")
    op.drop_table("staff_role_milestones")

    op.drop_index("ix_staff_assigned_tasks_deleted_at", table_name="staff_assigned_tasks")
    op.drop_index("ix_staff_assigned_tasks_is_completed", table_name="staff_assigned_tasks")
    op.drop_index("ix_staff_assigned_tasks_work_date", table_name="staff_assigned_tasks")
    op.drop_index("ix_staff_assigned_tasks_assigned_by_staff_user_id", table_name="staff_assigned_tasks")
    op.drop_index("ix_staff_assigned_tasks_staff_user_id", table_name="staff_assigned_tasks")
    op.drop_table("staff_assigned_tasks")

