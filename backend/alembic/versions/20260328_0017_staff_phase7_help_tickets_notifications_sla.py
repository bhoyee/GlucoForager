"""staff portal phase 7: help/tickets assignment + notifications + SLA fields

Revision ID: 20260328_0017
Revises: 20260328_0016
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0017"
down_revision = "20260328_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tickets: priority + SLA timestamps.
    op.add_column("staff_tickets", sa.Column("priority", sa.String(), nullable=False, server_default="normal"))
    op.add_column("staff_tickets", sa.Column("first_response_at", sa.DateTime(), nullable=True))
    op.add_column("staff_tickets", sa.Column("last_message_at", sa.DateTime(), nullable=True))
    op.add_column("staff_tickets", sa.Column("closed_at", sa.DateTime(), nullable=True))
    op.create_index("ix_staff_tickets_priority", "staff_tickets", ["priority"], unique=False)
    op.create_index("ix_staff_tickets_last_message_at", "staff_tickets", ["last_message_at"], unique=False)
    op.create_index("ix_staff_tickets_closed_at", "staff_tickets", ["closed_at"], unique=False)

    # Staff in-app notifications.
    op.create_table(
        "staff_notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.String(), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_notifications_staff_user_id", "staff_notifications", ["staff_user_id"], unique=False)
    op.create_index("ix_staff_notifications_type", "staff_notifications", ["type"], unique=False)
    op.create_index("ix_staff_notifications_read_at", "staff_notifications", ["read_at"], unique=False)
    op.create_index("ix_staff_notifications_created_at", "staff_notifications", ["created_at"], unique=False)

    # Permissions.
    op.execute(
        sa.text(
            "INSERT INTO staff_permissions (key, name, description, created_at) VALUES (:k,:n,:d, now()) ON CONFLICT (key) DO NOTHING"
        ).bindparams(
            k="tickets.manage",
            n="Manage tickets",
            d="Assign tickets, change priority/status, and view SLA dashboard.",
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO staff_permissions (key, name, description, created_at) VALUES (:k,:n,:d, now()) ON CONFLICT (key) DO NOTHING"
        ).bindparams(
            k="notifications.read",
            n="Read notifications",
            d="View in-app staff notifications.",
        )
    )

    # Give HR/support/developer the manage permission; give all roles notifications.read.
    for role_key in ("hr", "support", "developer"):
        op.execute(
            sa.text(
                """
                INSERT INTO staff_role_permissions (role_id, permission_id)
                SELECT r.id, p.id
                FROM staff_roles r
                JOIN staff_permissions p ON p.key = :perm_key
                WHERE r.key = :role_key
                ON CONFLICT DO NOTHING
                """
            ).bindparams(role_key=role_key, perm_key="tickets.manage")
        )

    for role_key in ("admin", "marketer", "designer", "developer", "hr", "support"):
        op.execute(
            sa.text(
                """
                INSERT INTO staff_role_permissions (role_id, permission_id)
                SELECT r.id, p.id
                FROM staff_roles r
                JOIN staff_permissions p ON p.key = :perm_key
                WHERE r.key = :role_key
                ON CONFLICT DO NOTHING
                """
            ).bindparams(role_key=role_key, perm_key="notifications.read")
        )


def downgrade() -> None:
    op.drop_index("ix_staff_notifications_created_at", table_name="staff_notifications")
    op.drop_index("ix_staff_notifications_read_at", table_name="staff_notifications")
    op.drop_index("ix_staff_notifications_type", table_name="staff_notifications")
    op.drop_index("ix_staff_notifications_staff_user_id", table_name="staff_notifications")
    op.drop_table("staff_notifications")

    op.drop_index("ix_staff_tickets_closed_at", table_name="staff_tickets")
    op.drop_index("ix_staff_tickets_last_message_at", table_name="staff_tickets")
    op.drop_index("ix_staff_tickets_priority", table_name="staff_tickets")
    op.drop_column("staff_tickets", "closed_at")
    op.drop_column("staff_tickets", "last_message_at")
    op.drop_column("staff_tickets", "first_response_at")
    op.drop_column("staff_tickets", "priority")

    op.execute(sa.text("DELETE FROM staff_permissions WHERE key IN ('tickets.manage','notifications.read')"))

