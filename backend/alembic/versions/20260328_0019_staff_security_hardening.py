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


def _has_table(inspector: sa.Inspector, name: str) -> bool:
    try:
        return bool(inspector.has_table(name))
    except Exception:
        return name in set(inspector.get_table_names())


def _has_column(inspector: sa.Inspector, table: str, column: str) -> bool:
    try:
        cols = inspector.get_columns(table)
    except Exception:
        return False
    return any(str(c.get("name")) == str(column) for c in cols)


def _has_index(inspector: sa.Inspector, table: str, index_name: str) -> bool:
    try:
        idxs = inspector.get_indexes(table)
    except Exception:
        return False
    return any(str(i.get("name")) == str(index_name) for i in idxs)


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if _has_table(inspector, "staff_users"):
        if not _has_column(inspector, "staff_users", "mfa_enabled"):
            op.add_column(
                "staff_users",
                sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            )
        if not _has_column(inspector, "staff_users", "mfa_method"):
            op.add_column("staff_users", sa.Column("mfa_method", sa.String(), nullable=True))

    if not _has_table(inspector, "staff_refresh_tokens"):
        op.create_table(
            "staff_refresh_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
            sa.Column("token_hash", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("last_used_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("created_ip", sa.String(), nullable=True),
            sa.Column("created_user_agent", sa.String(), nullable=True),
        )

    if not _has_index(inspector, "staff_refresh_tokens", "ix_staff_refresh_tokens_staff_user_id"):
        op.create_index("ix_staff_refresh_tokens_staff_user_id", "staff_refresh_tokens", ["staff_user_id"], unique=False)
    if not _has_index(inspector, "staff_refresh_tokens", "ix_staff_refresh_tokens_token_hash"):
        op.create_index("ix_staff_refresh_tokens_token_hash", "staff_refresh_tokens", ["token_hash"], unique=True)
    if not _has_index(inspector, "staff_refresh_tokens", "ix_staff_refresh_tokens_expires_at"):
        op.create_index("ix_staff_refresh_tokens_expires_at", "staff_refresh_tokens", ["expires_at"], unique=False)
    if not _has_index(inspector, "staff_refresh_tokens", "ix_staff_refresh_tokens_revoked_at"):
        op.create_index("ix_staff_refresh_tokens_revoked_at", "staff_refresh_tokens", ["revoked_at"], unique=False)

    if not _has_table(inspector, "staff_password_reset_tokens"):
        op.create_table(
            "staff_password_reset_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
            sa.Column("code_hash", sa.String(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("created_ip", sa.String(), nullable=True),
            sa.Column("created_user_agent", sa.String(), nullable=True),
        )

    if not _has_index(inspector, "staff_password_reset_tokens", "ix_staff_password_reset_tokens_staff_user_id"):
        op.create_index("ix_staff_password_reset_tokens_staff_user_id", "staff_password_reset_tokens", ["staff_user_id"], unique=False)
    if not _has_index(inspector, "staff_password_reset_tokens", "ix_staff_password_reset_tokens_code_hash"):
        op.create_index("ix_staff_password_reset_tokens_code_hash", "staff_password_reset_tokens", ["code_hash"], unique=False)
    if not _has_index(inspector, "staff_password_reset_tokens", "ix_staff_password_reset_tokens_expires_at"):
        op.create_index("ix_staff_password_reset_tokens_expires_at", "staff_password_reset_tokens", ["expires_at"], unique=False)
    if not _has_index(inspector, "staff_password_reset_tokens", "ix_staff_password_reset_tokens_used_at"):
        op.create_index("ix_staff_password_reset_tokens_used_at", "staff_password_reset_tokens", ["used_at"], unique=False)

    if not _has_table(inspector, "staff_mfa_challenges"):
        op.create_table(
            "staff_mfa_challenges",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
            sa.Column("code_hash", sa.String(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("created_ip", sa.String(), nullable=True),
            sa.Column("created_user_agent", sa.String(), nullable=True),
        )

    if not _has_index(inspector, "staff_mfa_challenges", "ix_staff_mfa_challenges_staff_user_id"):
        op.create_index("ix_staff_mfa_challenges_staff_user_id", "staff_mfa_challenges", ["staff_user_id"], unique=False)
    if not _has_index(inspector, "staff_mfa_challenges", "ix_staff_mfa_challenges_code_hash"):
        op.create_index("ix_staff_mfa_challenges_code_hash", "staff_mfa_challenges", ["code_hash"], unique=False)
    if not _has_index(inspector, "staff_mfa_challenges", "ix_staff_mfa_challenges_expires_at"):
        op.create_index("ix_staff_mfa_challenges_expires_at", "staff_mfa_challenges", ["expires_at"], unique=False)
    if not _has_index(inspector, "staff_mfa_challenges", "ix_staff_mfa_challenges_used_at"):
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
