"""private drive (mydrive/staffdrive)

Revision ID: 20260331_0003
Revises: 20260331_0002
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa


revision = "20260331_0003"
down_revision = "20260331_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_drive_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=True),
        sa.Column("content_type", sa.String(), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("storage_backend", sa.String(), nullable=False, server_default="ftp"),
        sa.Column("remote_dir", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by_staff_user_id", sa.Integer(), nullable=True),
        sa.Column("delete_reason", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_drive_files_staff_user_id", "staff_drive_files", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_drive_files_is_deleted", "staff_drive_files", ["is_deleted"], unique=False)
    op.create_index("ix_staff_drive_files_deleted_by_staff_user_id", "staff_drive_files", ["deleted_by_staff_user_id"], unique=False)

    op.create_table(
        "staff_drive_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("drive_file_id", sa.Integer(), sa.ForeignKey("staff_drive_files.id"), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_drive_events_drive_file_id", "staff_drive_events", ["drive_file_id"], unique=False)
    op.create_index("ix_staff_drive_events_actor_id", "staff_drive_events", ["actor_id"], unique=False)
    op.create_index("ix_staff_drive_events_created_at", "staff_drive_events", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_staff_drive_events_created_at", table_name="staff_drive_events")
    op.drop_index("ix_staff_drive_events_actor_id", table_name="staff_drive_events")
    op.drop_index("ix_staff_drive_events_drive_file_id", table_name="staff_drive_events")
    op.drop_table("staff_drive_events")

    op.drop_index("ix_staff_drive_files_deleted_by_staff_user_id", table_name="staff_drive_files")
    op.drop_index("ix_staff_drive_files_is_deleted", table_name="staff_drive_files")
    op.drop_index("ix_staff_drive_files_staff_user_id", table_name="staff_drive_files")
    op.drop_table("staff_drive_files")

