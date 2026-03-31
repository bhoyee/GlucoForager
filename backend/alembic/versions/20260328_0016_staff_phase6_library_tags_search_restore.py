"""staff portal phase 6: library tags/search/restore + metadata

Revision ID: 20260328_0016
Revises: 20260328_0015
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0016"
down_revision = "20260328_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff_library_items", sa.Column("original_filename", sa.String(), nullable=True))
    op.add_column("staff_library_items", sa.Column("content_type", sa.String(), nullable=True))
    op.add_column("staff_library_items", sa.Column("tags", sa.String(), nullable=True))

    op.create_index("ix_staff_library_items_is_deleted", "staff_library_items", ["is_deleted"], unique=False)
    op.create_index("ix_staff_library_items_kind", "staff_library_items", ["kind"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_staff_library_items_kind", table_name="staff_library_items")
    op.drop_index("ix_staff_library_items_is_deleted", table_name="staff_library_items")

    op.drop_column("staff_library_items", "tags")
    op.drop_column("staff_library_items", "content_type")
    op.drop_column("staff_library_items", "original_filename")

