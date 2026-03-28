"""staff security hardening: reset, refresh, mfa

Revision ID: 20260328_0019
Revises: 20260328_0018
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0019"
down_revision = "20260328_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff_users", sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("staff_users", sa.Column("mfa_method", sa.String(), nullable=True))

    op.create_table(
        "staff_refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_ip", sa.String(), nullable=True),
        sa.Column("created_user_agent", sa.String(), nullable=True),
    )
    op.create_index("ix_staff_refresh_tokens_staff_user_id", "staff_refresh_tokens", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_refresh_tokens_token_hash", "staff_refresh_tokens", ["token_hash"], unique=True)
    op.create_index("ix_staff_refresh_tokens_expires_at", "staff_refresh_tokens", ["expires_at"], unique=False)
    op.create_index("ix_staff_refresh_tokens_revoked_at", "staff_refresh_tokens", ["revoked_at"], unique=False)

    op.create_table(
        "staff_password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False, index=True),
        sa.Column("code_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("created_ip", sa.String(), nullable=True),
        sa.Column("created_user_agent", sa.String(), nullable=True),
    )
    op.create_index("ix_staff_password_reset_tokens_staff_user_id", "staff_password_reset_tokens", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_password_reset_tokens_code_hash", "staff_password_reset_tokens", ["code_hash"], unique=False)
    op.create_index("ix_staff_password_reset_tokens_expires_at", "staff_password_reset_tokens", ["expires_at"], unique=False)
    op.create_index("ix_staff_password_reset_tokens_used_at", "staff_password_reset_tokens", ["used_at"], unique=False)

    op.create_table(
        "staff_mfa_challenges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False, index=True),
        sa.Column("code_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("created_ip", sa.String(), nullable=True),
        sa.Column("created_user_agent", sa.String(), nullable=True),
    )
    op.create_index("ix_staff_mfa_challenges_staff_user_id", "staff_mfa_challenges", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_mfa_challenges_code_hash", "staff_mfa_challenges", ["code_hash"], unique=False)
    op.create_index("ix_staff_mfa_challenges_expires_at", "staff_mfa_challenges", ["expires_at"], unique=False)
    op.create_index("ix_staff_mfa_challenges_used_at", "staff_mfa_challenges", ["used_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_staff_mfa_challenges_used_at", table_name="staff_mfa_challenges")
    op.drop_index("ix_staff_mfa_challenges_expires_at", table_name="staff_mfa_challenges")
    op.drop_index("ix_staff_mfa_challenges_code_hash", table_name="staff_mfa_challenges")
    op.drop_index("ix_staff_mfa_challenges_staff_user_id", table_name="staff_mfa_challenges")
    op.drop_table("staff_mfa_challenges")

    op.drop_index("ix_staff_password_reset_tokens_used_at", table_name="staff_password_reset_tokens")
    op.drop_index("ix_staff_password_reset_tokens_expires_at", table_name="staff_password_reset_tokens")
    op.drop_index("ix_staff_password_reset_tokens_code_hash", table_name="staff_password_reset_tokens")
    op.drop_index("ix_staff_password_reset_tokens_staff_user_id", table_name="staff_password_reset_tokens")
    op.drop_table("staff_password_reset_tokens")

    op.drop_index("ix_staff_refresh_tokens_revoked_at", table_name="staff_refresh_tokens")
    op.drop_index("ix_staff_refresh_tokens_expires_at", table_name="staff_refresh_tokens")
    op.drop_index("ix_staff_refresh_tokens_token_hash", table_name="staff_refresh_tokens")
    op.drop_index("ix_staff_refresh_tokens_staff_user_id", table_name="staff_refresh_tokens")
    op.drop_table("staff_refresh_tokens")

    op.drop_column("staff_users", "mfa_method")
    op.drop_column("staff_users", "mfa_enabled")

