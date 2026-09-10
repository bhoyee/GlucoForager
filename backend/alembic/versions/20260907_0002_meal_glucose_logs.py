"""add meal_log_entries and glucose_readings tables

Revision ID: 20260907_0002
Revises: 20260907_0001
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260907_0002"
down_revision = "20260907_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meal_log_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("logged_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meal_log_entries_id", "meal_log_entries", ["id"], unique=False)
    op.create_index("ix_meal_log_entries_user_id", "meal_log_entries", ["user_id"], unique=False)
    op.create_index("ix_meal_log_entries_logged_at", "meal_log_entries", ["logged_at"], unique=False)

    op.create_table(
        "glucose_readings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("value_mg_dl", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("logged_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_glucose_readings_id", "glucose_readings", ["id"], unique=False)
    op.create_index("ix_glucose_readings_user_id", "glucose_readings", ["user_id"], unique=False)
    op.create_index("ix_glucose_readings_logged_at", "glucose_readings", ["logged_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_glucose_readings_logged_at", table_name="glucose_readings")
    op.drop_index("ix_glucose_readings_user_id", table_name="glucose_readings")
    op.drop_index("ix_glucose_readings_id", table_name="glucose_readings")
    op.drop_table("glucose_readings")

    op.drop_index("ix_meal_log_entries_logged_at", table_name="meal_log_entries")
    op.drop_index("ix_meal_log_entries_user_id", table_name="meal_log_entries")
    op.drop_index("ix_meal_log_entries_id", table_name="meal_log_entries")
    op.drop_table("meal_log_entries")
