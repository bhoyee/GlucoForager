"""Add admin email campaign history.

Revision ID: 20260228_0003
Revises: 20260228_0002
Create Date: 2026-02-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260228_0003"
down_revision = "20260228_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_email_campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("body_html", sa.Boolean(), nullable=True),
        sa.Column("test_email", sa.String(), nullable=True),
        sa.Column("recipient_email", sa.String(), nullable=True),
        sa.Column("sent_count", sa.Integer(), nullable=True),
        sa.Column("total_count", sa.Integer(), nullable=True),
        sa.Column("created_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    op.create_index(op.f("ix_admin_email_campaigns_kind"), "admin_email_campaigns", ["kind"], unique=False)
    op.create_index(op.f("ix_admin_email_campaigns_mode"), "admin_email_campaigns", ["mode"], unique=False)
    op.create_index(op.f("ix_admin_email_campaigns_created_at"), "admin_email_campaigns", ["created_at"], unique=False)
    op.create_index(op.f("ix_admin_email_campaigns_created_by_admin_id"), "admin_email_campaigns", ["created_by_admin_id"], unique=False)
    op.create_index(op.f("ix_admin_email_campaigns_deleted_at"), "admin_email_campaigns", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_email_campaigns_deleted_at"), table_name="admin_email_campaigns")
    op.drop_index(op.f("ix_admin_email_campaigns_created_by_admin_id"), table_name="admin_email_campaigns")
    op.drop_index(op.f("ix_admin_email_campaigns_created_at"), table_name="admin_email_campaigns")
    op.drop_index(op.f("ix_admin_email_campaigns_mode"), table_name="admin_email_campaigns")
    op.drop_index(op.f("ix_admin_email_campaigns_kind"), table_name="admin_email_campaigns")
    op.drop_table("admin_email_campaigns")

