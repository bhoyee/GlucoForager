"""payroll phase 0-1: permissions + tables

Revision ID: 20260328_0020
Revises: 20260328_0019
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0020"
down_revision = "20260328_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Payroll permissions.
    perms = [
        ("payroll.manage", "Manage payroll", "Create payroll runs, set staff compensation, and send payroll emails."),
        ("payroll.read_own", "Read own payroll", "View your own payroll/payslips."),
    ]
    for key, name, desc in perms:
        op.execute(
            sa.text(
                "INSERT INTO staff_permissions (key, name, description, created_at) VALUES (:k,:n,:d, now()) ON CONFLICT (key) DO NOTHING"
            ).bindparams(k=key, n=name, d=desc)
        )

    # Grant payroll.manage to HR by default.
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = 'payroll.manage'
            WHERE r.key = 'hr'
            ON CONFLICT DO NOTHING
            """
        )
    )

    # Grant payroll.read_own to all seeded roles (admin already has '*', but harmless).
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = 'payroll.read_own'
            WHERE r.key = ANY(ARRAY['admin','marketer','designer','developer','hr','support'])
            ON CONFLICT DO NOTHING
            """
        )
    )

    # Staff compensation (set by HR/admin; used to auto-generate payroll items).
    op.create_table(
        "staff_compensation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="GBP"),
        sa.Column("monthly_gross", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("monthly_deductions_default", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_staff_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_compensation_staff_user_id", "staff_compensation", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_compensation_effective_from", "staff_compensation", ["effective_from"], unique=False)
    op.create_index("ix_staff_compensation_is_active", "staff_compensation", ["is_active"], unique=False)
    op.create_index("ix_staff_compensation_created_by_staff_user_id", "staff_compensation", ["created_by_staff_user_id"], unique=False)

    # Payroll runs.
    op.create_table(
        "payroll_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("created_by_staff_user_id", sa.Integer(), nullable=True),
        sa.Column("finalized_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("year", "month", name="uq_payroll_runs_year_month"),
    )
    op.create_index("ix_payroll_runs_year", "payroll_runs", ["year"], unique=False)
    op.create_index("ix_payroll_runs_month", "payroll_runs", ["month"], unique=False)
    op.create_index("ix_payroll_runs_status", "payroll_runs", ["status"], unique=False)
    op.create_index("ix_payroll_runs_created_by_staff_user_id", "payroll_runs", ["created_by_staff_user_id"], unique=False)
    op.create_index("ix_payroll_runs_finalized_at", "payroll_runs", ["finalized_at"], unique=False)

    # Payroll items.
    op.create_table(
        "payroll_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("payroll_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="GBP"),
        sa.Column("gross", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("deductions", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("net", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_payroll_items_run_id", "payroll_items", ["run_id"], unique=False)
    op.create_index("ix_payroll_items_staff_user_id", "payroll_items", ["staff_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_payroll_items_staff_user_id", table_name="payroll_items")
    op.drop_index("ix_payroll_items_run_id", table_name="payroll_items")
    op.drop_table("payroll_items")

    op.drop_index("ix_payroll_runs_finalized_at", table_name="payroll_runs")
    op.drop_index("ix_payroll_runs_created_by_staff_user_id", table_name="payroll_runs")
    op.drop_index("ix_payroll_runs_status", table_name="payroll_runs")
    op.drop_index("ix_payroll_runs_month", table_name="payroll_runs")
    op.drop_index("ix_payroll_runs_year", table_name="payroll_runs")
    op.drop_table("payroll_runs")

    op.drop_index("ix_staff_compensation_created_by_staff_user_id", table_name="staff_compensation")
    op.drop_index("ix_staff_compensation_is_active", table_name="staff_compensation")
    op.drop_index("ix_staff_compensation_effective_from", table_name="staff_compensation")
    op.drop_index("ix_staff_compensation_staff_user_id", table_name="staff_compensation")
    op.drop_table("staff_compensation")

    op.execute(sa.text("DELETE FROM staff_permissions WHERE key IN ('payroll.manage','payroll.read_own')"))

