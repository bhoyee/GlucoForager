"""staff milestone progress (per-user)

Revision ID: 20260329_0005
Revises: 20260329_0004
Create Date: 2026-03-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260329_0005"
down_revision = "20260329_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_milestone_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("milestone_id", sa.Integer(), sa.ForeignKey("staff_role_milestones.id"), nullable=False),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completion_note", sa.String(length=240), nullable=True),
        sa.Column("proof_links", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("staff_user_id", "milestone_id", name="uq_staff_milestone_progress_user_milestone"),
    )
    op.create_index("ix_staff_milestone_progress_staff_user_id", "staff_milestone_progress", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_milestone_progress_milestone_id", "staff_milestone_progress", ["milestone_id"], unique=False)
    op.create_index("ix_staff_milestone_progress_is_completed", "staff_milestone_progress", ["is_completed"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_staff_milestone_progress_is_completed", table_name="staff_milestone_progress")
    op.drop_index("ix_staff_milestone_progress_milestone_id", table_name="staff_milestone_progress")
    op.drop_index("ix_staff_milestone_progress_staff_user_id", table_name="staff_milestone_progress")
    op.drop_table("staff_milestone_progress")

