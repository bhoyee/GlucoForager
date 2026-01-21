"""add ai_jobs table

Revision ID: 20260121_0006
Revises: 20260118_0005
Create Date: 2026-01-21 00:06:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260121_0006"
down_revision = "20260118_0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_jobs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_jobs_id", "ai_jobs", ["id"], unique=False)
    op.create_index("ix_ai_jobs_user_id", "ai_jobs", ["user_id"], unique=False)


def downgrade():
    op.drop_index("ix_ai_jobs_user_id", table_name="ai_jobs")
    op.drop_index("ix_ai_jobs_id", table_name="ai_jobs")
    op.drop_table("ai_jobs")
