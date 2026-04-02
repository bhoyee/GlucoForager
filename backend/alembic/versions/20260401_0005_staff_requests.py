"""staff requests module

Revision ID: 20260401_0005
Revises: 20260401_0004
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_0005"
down_revision = "20260401_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Permissions.
    perms = [
        ("requests.read_own", "Read own requests", "View your own requests (leave, day off, training, etc)."),
        ("requests.write_own", "Write own requests", "Create and submit your own requests."),
        ("requests.manage", "Manage requests", "Review and approve/reject staff requests."),
    ]
    for key, name, desc in perms:
        op.execute(
            sa.text(
                "INSERT INTO staff_permissions (key, name, description, created_at) VALUES (:k,:n,:d, now()) ON CONFLICT (key) DO NOTHING"
            ).bindparams(k=key, n=name, d=desc)
        )

    # Grant manage to HR by default.
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = 'requests.manage'
            WHERE r.key = 'hr'
            ON CONFLICT DO NOTHING
            """
        )
    )

    # Grant read/write own to all staff roles (including operations).
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = ANY(:perm_keys)
            WHERE r.key = ANY(ARRAY['admin','marketer','designer','developer','hr','support','operations'])
            ON CONFLICT DO NOTHING
            """
        ).bindparams(perm_keys=["requests.read_own", "requests.write_own"])
    )

    # Table.
    op.create_table(
        "staff_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("details", sa.String(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("decided_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("decision_comment", sa.String(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by_staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_requests_staff_user_id", "staff_requests", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_requests_type", "staff_requests", ["type"], unique=False)
    op.create_index("ix_staff_requests_status", "staff_requests", ["status"], unique=False)
    op.create_index("ix_staff_requests_start_date", "staff_requests", ["start_date"], unique=False)
    op.create_index("ix_staff_requests_end_date", "staff_requests", ["end_date"], unique=False)
    op.create_index("ix_staff_requests_submitted_at", "staff_requests", ["submitted_at"], unique=False)
    op.create_index("ix_staff_requests_deleted_at", "staff_requests", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_staff_requests_deleted_at", table_name="staff_requests")
    op.drop_index("ix_staff_requests_submitted_at", table_name="staff_requests")
    op.drop_index("ix_staff_requests_end_date", table_name="staff_requests")
    op.drop_index("ix_staff_requests_start_date", table_name="staff_requests")
    op.drop_index("ix_staff_requests_status", table_name="staff_requests")
    op.drop_index("ix_staff_requests_type", table_name="staff_requests")
    op.drop_index("ix_staff_requests_staff_user_id", table_name="staff_requests")
    op.drop_table("staff_requests")

    op.execute(sa.text("DELETE FROM staff_permissions WHERE key IN ('requests.read_own','requests.write_own','requests.manage')"))

