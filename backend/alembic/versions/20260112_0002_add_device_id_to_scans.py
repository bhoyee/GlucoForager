"""add device id to scans

Revision ID: 20260112_0002
Revises: 20260112_0001
Create Date: 2026-01-12 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260112_0002"
down_revision = "20260112_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_requests", sa.Column("device_id", sa.String(), nullable=True))
    op.create_index("ix_ai_requests_device_id", "ai_requests", ["device_id"], unique=False)

    op.add_column("search_logs", sa.Column("device_id", sa.String(), nullable=True))
    op.create_index("ix_search_logs_device_id", "search_logs", ["device_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_search_logs_device_id", table_name="search_logs")
    op.drop_column("search_logs", "device_id")

    op.drop_index("ix_ai_requests_device_id", table_name="ai_requests")
    op.drop_column("ai_requests", "device_id")
