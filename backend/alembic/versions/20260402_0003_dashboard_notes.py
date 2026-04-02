"""dashboard notes (standup sticky note)

Revision ID: 20260402_0003
Revises: 20260402_0002
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa


revision = "20260402_0003"
down_revision = "20260402_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_dashboard_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("meeting_url", sa.String(length=512), nullable=True),
        sa.Column("visible_from", sa.DateTime(), nullable=True),
        sa.Column("visible_until", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("target_all", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_staff_user_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_staff_user_id", sa.Integer(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by_staff_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by_staff_user_id"], ["staff_users.id"]),
        sa.ForeignKeyConstraint(["updated_by_staff_user_id"], ["staff_users.id"]),
        sa.ForeignKeyConstraint(["deleted_by_staff_user_id"], ["staff_users.id"]),
    )
    op.create_index(
        "ix_staff_dashboard_notes_status_window",
        "staff_dashboard_notes",
        ["is_deleted", "status", "visible_from", "visible_until"],
    )

    op.create_table(
        "staff_dashboard_note_target_roles",
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["staff_dashboard_notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["staff_roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("note_id", "role_id"),
    )
    op.create_table(
        "staff_dashboard_note_target_users",
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("staff_user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["staff_dashboard_notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["staff_user_id"], ["staff_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("note_id", "staff_user_id"),
    )

    op.execute(
        sa.text(
            """
            INSERT INTO staff_permissions (key, name, description, created_at)
            VALUES ('dashboard_notes.manage', 'Dashboard notes', 'Create and publish dashboard sticky notes', now())
            ON CONFLICT (key) DO NOTHING
            """
        )
    )

    # Admin + HR can manage dashboard notes.
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r
            JOIN staff_permissions p ON p.key = 'dashboard_notes.manage'
            WHERE r.key IN ('admin', 'hr')
            ON CONFLICT DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM staff_role_permissions
            WHERE permission_id IN (SELECT id FROM staff_permissions WHERE key='dashboard_notes.manage')
            """
        )
    )
    op.execute(sa.text("DELETE FROM staff_permissions WHERE key='dashboard_notes.manage'"))
    op.drop_table("staff_dashboard_note_target_users")
    op.drop_table("staff_dashboard_note_target_roles")
    op.drop_index("ix_staff_dashboard_notes_status_window", table_name="staff_dashboard_notes")
    op.drop_table("staff_dashboard_notes")

