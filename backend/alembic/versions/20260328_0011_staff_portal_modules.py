"""staff portal modules (attendance, work logs, library, tickets, expenses)

Revision ID: 20260328_0011
Revises: 20260328_0010
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0011"
down_revision = "20260328_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_time_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("clock_in_at", sa.DateTime(), nullable=True),
        sa.Column("clock_out_at", sa.DateTime(), nullable=True),
        sa.Column("clock_in_ip", sa.String(), nullable=True),
        sa.Column("clock_out_ip", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("staff_user_id", "work_date", name="uq_staff_time_entries_user_date"),
    )
    op.create_index("ix_staff_time_entries_staff_user_id", "staff_time_entries", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_time_entries_work_date", "staff_time_entries", ["work_date"], unique=False)

    op.create_table(
        "staff_work_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("staff_user_id", "work_date", name="uq_staff_work_logs_user_date"),
    )
    op.create_index("ix_staff_work_logs_staff_user_id", "staff_work_logs", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_work_logs_work_date", "staff_work_logs", ["work_date"], unique=False)

    op.create_table(
        "staff_library_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("folder", sa.String(), nullable=False, server_default="general"),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by_staff_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_library_items_staff_user_id", "staff_library_items", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_library_items_folder", "staff_library_items", ["folder"], unique=False)

    op.create_table(
        "staff_tickets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("assigned_to_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_tickets_created_by_staff_user_id", "staff_tickets", ["created_by_staff_user_id"], unique=False)
    op.create_index("ix_staff_tickets_assigned_to_staff_user_id", "staff_tickets", ["assigned_to_staff_user_id"], unique=False)
    op.create_index("ix_staff_tickets_status", "staff_tickets", ["status"], unique=False)

    op.create_table(
        "staff_ticket_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("staff_tickets.id"), nullable=False),
        sa.Column("author_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_ticket_messages_ticket_id", "staff_ticket_messages", ["ticket_id"], unique=False)
    op.create_index("ix_staff_ticket_messages_author_staff_user_id", "staff_ticket_messages", ["author_staff_user_id"], unique=False)

    op.create_table(
        "staff_expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="GBP"),
        sa.Column("category", sa.String(), nullable=False, server_default="general"),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_expenses_created_by_staff_user_id", "staff_expenses", ["created_by_staff_user_id"], unique=False)
    op.create_index("ix_staff_expenses_expense_date", "staff_expenses", ["expense_date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_staff_expenses_expense_date", table_name="staff_expenses")
    op.drop_index("ix_staff_expenses_created_by_staff_user_id", table_name="staff_expenses")
    op.drop_table("staff_expenses")

    op.drop_index("ix_staff_ticket_messages_author_staff_user_id", table_name="staff_ticket_messages")
    op.drop_index("ix_staff_ticket_messages_ticket_id", table_name="staff_ticket_messages")
    op.drop_table("staff_ticket_messages")

    op.drop_index("ix_staff_tickets_status", table_name="staff_tickets")
    op.drop_index("ix_staff_tickets_assigned_to_staff_user_id", table_name="staff_tickets")
    op.drop_index("ix_staff_tickets_created_by_staff_user_id", table_name="staff_tickets")
    op.drop_table("staff_tickets")

    op.drop_index("ix_staff_library_items_folder", table_name="staff_library_items")
    op.drop_index("ix_staff_library_items_staff_user_id", table_name="staff_library_items")
    op.drop_table("staff_library_items")

    op.drop_index("ix_staff_work_logs_work_date", table_name="staff_work_logs")
    op.drop_index("ix_staff_work_logs_staff_user_id", table_name="staff_work_logs")
    op.drop_table("staff_work_logs")

    op.drop_index("ix_staff_time_entries_work_date", table_name="staff_time_entries")
    op.drop_index("ix_staff_time_entries_staff_user_id", table_name="staff_time_entries")
    op.drop_table("staff_time_entries")

