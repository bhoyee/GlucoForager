"""staff requests attachments json

Revision ID: 20260401_0006
Revises: 20260401_0005
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_0006"
down_revision = "20260401_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff_requests", sa.Column("attachments", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")))
    op.execute(sa.text("UPDATE staff_requests SET attachments='[]'::json WHERE attachments IS NULL"))
    op.alter_column("staff_requests", "attachments", server_default=None)


def downgrade() -> None:
    op.drop_column("staff_requests", "attachments")

