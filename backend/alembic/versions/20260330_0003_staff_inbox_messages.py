"""staff inbox messages

Revision ID: 20260330_0003
Revises: 20260330_0002
Create Date: 2026-03-30
"""

from alembic import op
import sqlalchemy as sa


revision = "20260330_0003"
down_revision = "20260330_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_inbox_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("thread_id", sa.Integer(), nullable=True),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("staff_inbox_messages.id"), nullable=True),
        sa.Column("sender_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("recipient_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("to_email", sa.String(), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_inbox_messages_thread_id", "staff_inbox_messages", ["thread_id"], unique=False)
    op.create_index("ix_staff_inbox_messages_parent_id", "staff_inbox_messages", ["parent_id"], unique=False)
    op.create_index("ix_staff_inbox_messages_sender_staff_user_id", "staff_inbox_messages", ["sender_staff_user_id"], unique=False)
    op.create_index("ix_staff_inbox_messages_recipient_staff_user_id", "staff_inbox_messages", ["recipient_staff_user_id"], unique=False)
    op.create_index("ix_staff_inbox_messages_to_email", "staff_inbox_messages", ["to_email"], unique=False)
    op.create_index("ix_staff_inbox_messages_read_at", "staff_inbox_messages", ["read_at"], unique=False)
    op.create_index("ix_staff_inbox_messages_deleted_at", "staff_inbox_messages", ["deleted_at"], unique=False)
    op.create_index("ix_staff_inbox_messages_deleted_by_staff_user_id", "staff_inbox_messages", ["deleted_by_staff_user_id"], unique=False)
    op.create_index("ix_staff_inbox_messages_created_at", "staff_inbox_messages", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_staff_inbox_messages_created_at", table_name="staff_inbox_messages")
    op.drop_index("ix_staff_inbox_messages_deleted_by_staff_user_id", table_name="staff_inbox_messages")
    op.drop_index("ix_staff_inbox_messages_deleted_at", table_name="staff_inbox_messages")
    op.drop_index("ix_staff_inbox_messages_read_at", table_name="staff_inbox_messages")
    op.drop_index("ix_staff_inbox_messages_to_email", table_name="staff_inbox_messages")
    op.drop_index("ix_staff_inbox_messages_recipient_staff_user_id", table_name="staff_inbox_messages")
    op.drop_index("ix_staff_inbox_messages_sender_staff_user_id", table_name="staff_inbox_messages")
    op.drop_index("ix_staff_inbox_messages_parent_id", table_name="staff_inbox_messages")
    op.drop_index("ix_staff_inbox_messages_thread_id", table_name="staff_inbox_messages")
    op.drop_table("staff_inbox_messages")

