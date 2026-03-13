"""add user_daily_challenges

Revision ID: 20260313_0001
Revises: 20260228_0003
Create Date: 2026-03-13
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260313_0001"
down_revision = "20260228_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_daily_challenges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("tasks_json", sa.Text(), nullable=False),
        sa.Column("completed_task_ids_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("user_id", "date", name="uq_user_daily_challenges_user_date"),
    )
    op.create_index("ix_user_daily_challenges_user_id", "user_daily_challenges", ["user_id"])
    op.create_index("ix_user_daily_challenges_date", "user_daily_challenges", ["date"])


def downgrade() -> None:
    op.drop_index("ix_user_daily_challenges_date", table_name="user_daily_challenges")
    op.drop_index("ix_user_daily_challenges_user_id", table_name="user_daily_challenges")
    op.drop_table("user_daily_challenges")

