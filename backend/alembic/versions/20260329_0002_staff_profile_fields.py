"""staff profile fields (name, country, contact, next-of-kin, avatar)

Revision ID: 20260329_0002
Revises: 20260329_0001
Create Date: 2026-03-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260329_0002"
down_revision = "20260329_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff_users", sa.Column("full_name", sa.String(), nullable=True))
    op.add_column("staff_users", sa.Column("country", sa.String(), nullable=True))
    op.add_column("staff_users", sa.Column("address", sa.String(), nullable=True))
    op.add_column("staff_users", sa.Column("phone_number", sa.String(), nullable=True))
    op.add_column("staff_users", sa.Column("gender", sa.String(), nullable=True))
    op.add_column("staff_users", sa.Column("next_of_kin_name", sa.String(), nullable=True))
    op.add_column("staff_users", sa.Column("next_of_kin_contact", sa.String(), nullable=True))
    op.add_column("staff_users", sa.Column("next_of_kin_relationship", sa.String(), nullable=True))
    op.add_column("staff_users", sa.Column("next_of_kin_address", sa.String(), nullable=True))
    op.add_column("staff_users", sa.Column("avatar_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("staff_users", "avatar_url")
    op.drop_column("staff_users", "next_of_kin_address")
    op.drop_column("staff_users", "next_of_kin_relationship")
    op.drop_column("staff_users", "next_of_kin_contact")
    op.drop_column("staff_users", "next_of_kin_name")
    op.drop_column("staff_users", "gender")
    op.drop_column("staff_users", "phone_number")
    op.drop_column("staff_users", "address")
    op.drop_column("staff_users", "country")
    op.drop_column("staff_users", "full_name")

