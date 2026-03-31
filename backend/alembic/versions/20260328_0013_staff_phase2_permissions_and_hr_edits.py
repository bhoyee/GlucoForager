"""staff portal phase 2: permissions + HR attendance edits

Revision ID: 20260328_0013
Revises: 20260328_0012
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0013"
down_revision = "20260328_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # HR edit metadata for attendance.
    op.add_column("staff_time_entries", sa.Column("edited_at", sa.DateTime(), nullable=True))
    op.add_column("staff_time_entries", sa.Column("edited_by_staff_user_id", sa.Integer(), nullable=True))
    op.add_column("staff_time_entries", sa.Column("edit_reason", sa.String(), nullable=True))
    op.create_index("ix_staff_time_entries_edited_by_staff_user_id", "staff_time_entries", ["edited_by_staff_user_id"], unique=False)

    # Phase 2 permissions for staff portal modules.
    perms = [
        ("staff.manage", "Manage staff", "Create/disable staff accounts and assign roles."),
        ("reports.read", "Read staff reports", "View staff reports."),
        ("attendance.read", "Read attendance", "View clock-in/out history."),
        ("attendance.write", "Write attendance", "Clock in/out."),
        ("attendance.manage", "Manage attendance", "Edit/fix attendance entries."),
        ("work_logs.read", "Read work logs", "View staff work logs."),
        ("work_logs.write", "Write work logs", "Create/update own work logs."),
        ("library.read", "Read library", "View shared library items."),
        ("library.upload", "Upload library items", "Upload documents/images to library."),
        ("library.delete_own", "Delete own library items", "Soft-delete own uploads."),
        ("library.delete_any", "Delete any library items", "Soft-delete any uploads (admin)."),
        ("tickets.read", "Read tickets", "View help tickets."),
        ("tickets.write", "Write tickets", "Create/reply to help tickets."),
        ("tickets.close", "Close tickets", "Close help tickets."),
        ("expenses.read", "Read expenses", "View expenses."),
        ("expenses.write", "Write expenses", "Create/delete expenses."),
    ]
    for key, name, desc in perms:
        op.execute(
            sa.text(
                "INSERT INTO staff_permissions (key, name, description, created_at) VALUES (:k,:n,:d, now()) ON CONFLICT (key) DO NOTHING"
            ).bindparams(k=key, n=name, d=desc)
        )

    # Assign default permissions to seeded roles.
    role_perms: dict[str, list[str]] = {
        "marketer": [
            "blog.read",
            "blog.write",
            "blog.publish",
            "newsletter.send",
            "push.send",
            "library.read",
            "library.upload",
            "library.delete_own",
            "tickets.read",
            "tickets.write",
            "tickets.close",
            "attendance.read",
            "attendance.write",
            "work_logs.read",
            "work_logs.write",
        ],
        "designer": [
            "blog.read",
            "library.read",
            "library.upload",
            "library.delete_own",
            "tickets.read",
            "tickets.write",
            "tickets.close",
            "attendance.read",
            "attendance.write",
            "work_logs.read",
            "work_logs.write",
        ],
        "developer": [
            "logs.read",
            "system.read",
            "backups.run",
            "tickets.read",
            "tickets.write",
            "tickets.close",
            "attendance.read",
            "attendance.write",
            "work_logs.read",
            "work_logs.write",
            "library.read",
        ],
        "hr": [
            "staff.manage",
            "reports.read",
            "attendance.read",
            "attendance.write",
            "attendance.manage",
            "work_logs.read",
            "tickets.read",
            "tickets.write",
            "tickets.close",
            "expenses.read",
            "expenses.write",
            "library.read",
        ],
        "support": [
            "users.read",
            "email.send",
            "recipes.write",
            "tips.write",
            "challenge.write",
            "tickets.read",
            "tickets.write",
            "tickets.close",
            "attendance.read",
            "attendance.write",
            "work_logs.read",
            "work_logs.write",
            "library.read",
        ],
    }

    for role_key, perm_keys in role_perms.items():
        op.execute(
            sa.text(
                """
                INSERT INTO staff_role_permissions (role_id, permission_id)
                SELECT r.id, p.id
                FROM staff_roles r
                JOIN staff_permissions p ON p.key = ANY(:perm_keys)
                WHERE r.key = :role_key
                ON CONFLICT DO NOTHING
                """
            ).bindparams(role_key=role_key, perm_keys=perm_keys)
        )


def downgrade() -> None:
    # Best-effort: remove the new permission rows and indexes/columns.
    op.drop_index("ix_staff_time_entries_edited_by_staff_user_id", table_name="staff_time_entries")
    op.drop_column("staff_time_entries", "edit_reason")
    op.drop_column("staff_time_entries", "edited_by_staff_user_id")
    op.drop_column("staff_time_entries", "edited_at")

    op.execute(
        sa.text(
            "DELETE FROM staff_permissions WHERE key IN (:keys)"
        ).bindparams(
            keys=[
                "staff.manage",
                "reports.read",
                "attendance.read",
                "attendance.write",
                "attendance.manage",
                "work_logs.read",
                "work_logs.write",
                "library.read",
                "library.upload",
                "library.delete_own",
                "library.delete_any",
                "tickets.read",
                "tickets.write",
                "tickets.close",
                "expenses.read",
                "expenses.write",
            ]
        )
    )

