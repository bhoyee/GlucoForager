"""staff inbox attachments

Revision ID: 20260330_0004
Revises: 20260330_0003
Create Date: 2026-03-30
"""

from alembic import op
import sqlalchemy as sa


revision = "20260330_0004"
down_revision = "20260330_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff_inbox_messages", sa.Column("attachment_original_name", sa.String(), nullable=True))
    op.add_column("staff_inbox_messages", sa.Column("attachment_filename", sa.String(), nullable=True))
    op.add_column("staff_inbox_messages", sa.Column("attachment_url", sa.String(), nullable=True))
    op.add_column("staff_inbox_messages", sa.Column("attachment_content_type", sa.String(), nullable=True))
    op.add_column("staff_inbox_messages", sa.Column("attachment_size_bytes", sa.Integer(), nullable=True))
    op.add_column("staff_inbox_messages", sa.Column("attachment_storage_backend", sa.String(), nullable=True))
    op.add_column("staff_inbox_messages", sa.Column("attachment_remote_dir", sa.String(), nullable=True))

    op.create_index("ix_staff_inbox_messages_attachment_filename", "staff_inbox_messages", ["attachment_filename"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_staff_inbox_messages_attachment_filename", table_name="staff_inbox_messages")

    op.drop_column("staff_inbox_messages", "attachment_remote_dir")
    op.drop_column("staff_inbox_messages", "attachment_storage_backend")
    op.drop_column("staff_inbox_messages", "attachment_size_bytes")
    op.drop_column("staff_inbox_messages", "attachment_content_type")
    op.drop_column("staff_inbox_messages", "attachment_url")
    op.drop_column("staff_inbox_messages", "attachment_filename")
    op.drop_column("staff_inbox_messages", "attachment_original_name")

