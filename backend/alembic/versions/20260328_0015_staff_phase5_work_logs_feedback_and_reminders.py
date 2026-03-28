"""staff portal phase 5: work log feedback + missing log reminders

Revision ID: 20260328_0015
Revises: 20260328_0014
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0015"
down_revision = "20260328_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Comments/feedback on staff work logs (HR/admin).
    op.create_table(
        "staff_work_log_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("work_log_id", sa.Integer(), sa.ForeignKey("staff_work_logs.id"), nullable=False),
        sa.Column("author_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("comment", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_work_log_comments_work_log_id", "staff_work_log_comments", ["work_log_id"], unique=False)
    op.create_index(
        "ix_staff_work_log_comments_author_staff_user_id",
        "staff_work_log_comments",
        ["author_staff_user_id"],
        unique=False,
    )
    op.create_index("ix_staff_work_log_comments_created_at", "staff_work_log_comments", ["created_at"], unique=False)

    # Missing work log reminders (records that HR/admin reminded a staff member).
    op.create_table(
        "staff_work_log_reminders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("created_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("staff_user_id", "work_date", name="uq_staff_work_log_reminders_staff_date"),
    )
    op.create_index("ix_staff_work_log_reminders_staff_user_id", "staff_work_log_reminders", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_work_log_reminders_work_date", "staff_work_log_reminders", ["work_date"], unique=False)
    op.create_index(
        "ix_staff_work_log_reminders_created_by_staff_user_id",
        "staff_work_log_reminders",
        ["created_by_staff_user_id"],
        unique=False,
    )

    # Permission for HR/admin work-log management (read/write across staff).
    op.execute(
        sa.text(
            "INSERT INTO staff_permissions (key, name, description, created_at) VALUES (:k,:n,:d, now()) ON CONFLICT (key) DO NOTHING"
        ).bindparams(
            k="work_logs.manage",
            n="Manage work logs",
            d="View all staff work logs, add feedback, and send reminders.",
        )
    )

    # Give HR the permission by default.
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = :perm_key
            WHERE r.key = :role_key
            ON CONFLICT DO NOTHING
            """
        ).bindparams(role_key="hr", perm_key="work_logs.manage")
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM staff_permissions WHERE key='work_logs.manage'"))

    op.drop_index("ix_staff_work_log_reminders_created_by_staff_user_id", table_name="staff_work_log_reminders")
    op.drop_index("ix_staff_work_log_reminders_work_date", table_name="staff_work_log_reminders")
    op.drop_index("ix_staff_work_log_reminders_staff_user_id", table_name="staff_work_log_reminders")
    op.drop_table("staff_work_log_reminders")

    op.drop_index("ix_staff_work_log_comments_created_at", table_name="staff_work_log_comments")
    op.drop_index("ix_staff_work_log_comments_author_staff_user_id", table_name="staff_work_log_comments")
    op.drop_index("ix_staff_work_log_comments_work_log_id", table_name="staff_work_log_comments")
    op.drop_table("staff_work_log_comments")

