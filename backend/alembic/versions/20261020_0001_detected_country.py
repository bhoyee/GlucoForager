"""users: detected country (IP history + phone region) and the one-off country prompt

Revision ID: 20261020_0001
Revises: 20261019_0001
Create Date: 2026-10-20
"""

from alembic import op
import sqlalchemy as sa


revision = "20261020_0001"
down_revision = "20261019_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # One {"d": date, "c": country} per day for 30 days; never the IP address itself.
    op.add_column("users", sa.Column("detected_countries", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("phone_region", sa.String(length=2), nullable=True))
    op.add_column("users", sa.Column("country_prompt_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("country_prompt_snoozed_until", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "country_prompt_snoozed_until")
    op.drop_column("users", "country_prompt_count")
    op.drop_column("users", "phone_region")
    op.drop_column("users", "detected_countries")
