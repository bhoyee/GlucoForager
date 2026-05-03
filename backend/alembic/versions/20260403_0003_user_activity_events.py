"""user activity events

Revision ID: 20260403_0003
Revises: 20260403_0002
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260403_0003"
down_revision = "20260403_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_active_at", sa.DateTime(), nullable=True))
    op.create_index("ix_users_last_active_at", "users", ["last_active_at"], unique=False)

    op.create_table(
        "user_activity_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_activity_events_id", "user_activity_events", ["id"], unique=False)
    op.create_index("ix_user_activity_events_user_id", "user_activity_events", ["user_id"], unique=False)
    op.create_index("ix_user_activity_events_event_type", "user_activity_events", ["event_type"], unique=False)
    op.create_index("ix_user_activity_events_source", "user_activity_events", ["source"], unique=False)
    op.create_index("ix_user_activity_events_created_at", "user_activity_events", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_activity_events_created_at", table_name="user_activity_events")
    op.drop_index("ix_user_activity_events_source", table_name="user_activity_events")
    op.drop_index("ix_user_activity_events_event_type", table_name="user_activity_events")
    op.drop_index("ix_user_activity_events_user_id", table_name="user_activity_events")
    op.drop_index("ix_user_activity_events_id", table_name="user_activity_events")
    op.drop_table("user_activity_events")

    op.drop_index("ix_users_last_active_at", table_name="users")
    op.drop_column("users", "last_active_at")
