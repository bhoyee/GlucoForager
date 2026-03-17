"""Add push notification campaigns and tokens.

Revision ID: 20260315_0001
Revises: 20260314_0001
Create Date: 2026-03-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20260315_0001"
down_revision = "20260314_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("platform", sa.String(), nullable=True),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
    )
    op.create_index(op.f("ix_push_tokens_user_id"), "push_tokens", ["user_id"], unique=False)
    op.create_index(op.f("ix_push_tokens_provider"), "push_tokens", ["provider"], unique=False)
    op.create_index(op.f("ix_push_tokens_platform"), "push_tokens", ["platform"], unique=False)
    op.create_index(op.f("ix_push_tokens_token"), "push_tokens", ["token"], unique=True)
    op.create_index(op.f("ix_push_tokens_enabled"), "push_tokens", ["enabled"], unique=False)
    op.create_index(op.f("ix_push_tokens_created_at"), "push_tokens", ["created_at"], unique=False)
    op.create_index(op.f("ix_push_tokens_updated_at"), "push_tokens", ["updated_at"], unique=False)
    op.create_index(op.f("ix_push_tokens_last_seen_at"), "push_tokens", ["last_seen_at"], unique=False)

    op.create_table(
        "admin_push_campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("deeplink", sa.String(), nullable=True),
        sa.Column("audience", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    op.create_index(op.f("ix_admin_push_campaigns_audience"), "admin_push_campaigns", ["audience"], unique=False)
    op.create_index(op.f("ix_admin_push_campaigns_status"), "admin_push_campaigns", ["status"], unique=False)
    op.create_index(op.f("ix_admin_push_campaigns_created_by_admin_id"), "admin_push_campaigns", ["created_by_admin_id"], unique=False)
    op.create_index(op.f("ix_admin_push_campaigns_created_at"), "admin_push_campaigns", ["created_at"], unique=False)
    op.create_index(op.f("ix_admin_push_campaigns_updated_at"), "admin_push_campaigns", ["updated_at"], unique=False)
    op.create_index(op.f("ix_admin_push_campaigns_deleted_at"), "admin_push_campaigns", ["deleted_at"], unique=False)

    op.create_table(
        "admin_push_sends",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("admin_push_campaigns.id"), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("queued_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("success_count", sa.Integer(), nullable=True),
        sa.Column("failure_count", sa.Integer(), nullable=True),
        sa.Column("error_summary", sa.Text(), nullable=True),
    )
    op.create_index(op.f("ix_admin_push_sends_campaign_id"), "admin_push_sends", ["campaign_id"], unique=False)
    op.create_index(op.f("ix_admin_push_sends_provider"), "admin_push_sends", ["provider"], unique=False)
    op.create_index(op.f("ix_admin_push_sends_mode"), "admin_push_sends", ["mode"], unique=False)
    op.create_index(op.f("ix_admin_push_sends_status"), "admin_push_sends", ["status"], unique=False)
    op.create_index(op.f("ix_admin_push_sends_queued_at"), "admin_push_sends", ["queued_at"], unique=False)
    op.create_index(op.f("ix_admin_push_sends_started_at"), "admin_push_sends", ["started_at"], unique=False)
    op.create_index(op.f("ix_admin_push_sends_finished_at"), "admin_push_sends", ["finished_at"], unique=False)

    op.create_table(
        "admin_push_send_failures",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("push_send_id", sa.Integer(), sa.ForeignKey("admin_push_sends.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("push_token_id", sa.Integer(), sa.ForeignKey("push_tokens.id"), nullable=True),
        sa.Column("token", sa.String(), nullable=True),
        sa.Column("error", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index(op.f("ix_admin_push_send_failures_push_send_id"), "admin_push_send_failures", ["push_send_id"], unique=False)
    op.create_index(op.f("ix_admin_push_send_failures_user_id"), "admin_push_send_failures", ["user_id"], unique=False)
    op.create_index(op.f("ix_admin_push_send_failures_push_token_id"), "admin_push_send_failures", ["push_token_id"], unique=False)
    op.create_index(op.f("ix_admin_push_send_failures_token"), "admin_push_send_failures", ["token"], unique=False)
    op.create_index(op.f("ix_admin_push_send_failures_created_at"), "admin_push_send_failures", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_push_send_failures_created_at"), table_name="admin_push_send_failures")
    op.drop_index(op.f("ix_admin_push_send_failures_token"), table_name="admin_push_send_failures")
    op.drop_index(op.f("ix_admin_push_send_failures_push_token_id"), table_name="admin_push_send_failures")
    op.drop_index(op.f("ix_admin_push_send_failures_user_id"), table_name="admin_push_send_failures")
    op.drop_index(op.f("ix_admin_push_send_failures_push_send_id"), table_name="admin_push_send_failures")
    op.drop_table("admin_push_send_failures")

    op.drop_index(op.f("ix_admin_push_sends_finished_at"), table_name="admin_push_sends")
    op.drop_index(op.f("ix_admin_push_sends_started_at"), table_name="admin_push_sends")
    op.drop_index(op.f("ix_admin_push_sends_queued_at"), table_name="admin_push_sends")
    op.drop_index(op.f("ix_admin_push_sends_status"), table_name="admin_push_sends")
    op.drop_index(op.f("ix_admin_push_sends_mode"), table_name="admin_push_sends")
    op.drop_index(op.f("ix_admin_push_sends_provider"), table_name="admin_push_sends")
    op.drop_index(op.f("ix_admin_push_sends_campaign_id"), table_name="admin_push_sends")
    op.drop_table("admin_push_sends")

    op.drop_index(op.f("ix_admin_push_campaigns_deleted_at"), table_name="admin_push_campaigns")
    op.drop_index(op.f("ix_admin_push_campaigns_updated_at"), table_name="admin_push_campaigns")
    op.drop_index(op.f("ix_admin_push_campaigns_created_at"), table_name="admin_push_campaigns")
    op.drop_index(op.f("ix_admin_push_campaigns_created_by_admin_id"), table_name="admin_push_campaigns")
    op.drop_index(op.f("ix_admin_push_campaigns_status"), table_name="admin_push_campaigns")
    op.drop_index(op.f("ix_admin_push_campaigns_audience"), table_name="admin_push_campaigns")
    op.drop_table("admin_push_campaigns")

    op.drop_index(op.f("ix_push_tokens_last_seen_at"), table_name="push_tokens")
    op.drop_index(op.f("ix_push_tokens_updated_at"), table_name="push_tokens")
    op.drop_index(op.f("ix_push_tokens_created_at"), table_name="push_tokens")
    op.drop_index(op.f("ix_push_tokens_enabled"), table_name="push_tokens")
    op.drop_index(op.f("ix_push_tokens_token"), table_name="push_tokens")
    op.drop_index(op.f("ix_push_tokens_platform"), table_name="push_tokens")
    op.drop_index(op.f("ix_push_tokens_provider"), table_name="push_tokens")
    op.drop_index(op.f("ix_push_tokens_user_id"), table_name="push_tokens")
    op.drop_table("push_tokens")

