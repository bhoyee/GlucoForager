"""merge heads (blog seo + staff portal)

Revision ID: 20260328_0012
Revises: 20260325_0001, 20260328_0011
Create Date: 2026-03-28
"""

from alembic import op  # noqa: F401


# revision identifiers, used by Alembic.
revision = "20260328_0012"
down_revision = ("20260325_0001", "20260328_0011")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Merge-only revision: no schema changes.
    pass


def downgrade() -> None:
    # Merge-only revision: no schema changes.
    pass

