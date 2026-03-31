"""add staff users + roles + permissions (rbac)

Revision ID: 20260328_0010
Revises: 20260221_0009
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260328_0010"
down_revision = "20260221_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("timezone", sa.String(), nullable=False, server_default="UTC"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_users_email", "staff_users", ["email"], unique=True)

    op.create_table(
        "staff_roles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_roles_key", "staff_roles", ["key"], unique=True)

    op.create_table(
        "staff_permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_permissions_key", "staff_permissions", ["key"], unique=True)

    op.create_table(
        "staff_user_roles",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("staff_roles.id"), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
    )
    op.create_index("ix_staff_user_roles_user_id", "staff_user_roles", ["user_id"], unique=False)
    op.create_index("ix_staff_user_roles_role_id", "staff_user_roles", ["role_id"], unique=False)

    op.create_table(
        "staff_role_permissions",
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("staff_roles.id"), nullable=False),
        sa.Column("permission_id", sa.Integer(), sa.ForeignKey("staff_permissions.id"), nullable=False),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
    )
    op.create_index("ix_staff_role_permissions_role_id", "staff_role_permissions", ["role_id"], unique=False)
    op.create_index("ix_staff_role_permissions_permission_id", "staff_role_permissions", ["permission_id"], unique=False)

    op.create_table(
        "staff_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("entity", sa.String(), nullable=True),
        sa.Column("entity_id", sa.String(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("ip", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_staff_audit_logs_actor_id", "staff_audit_logs", ["actor_id"], unique=False)
    op.create_index("ix_staff_audit_logs_created_at", "staff_audit_logs", ["created_at"], unique=False)

    # Seed roles (you can change/manage these in-app later).
    roles = [
        ("admin", "Admin", "Full access"),
        ("marketer", "Marketer", "Content, newsletter, pushes"),
        ("designer", "Designer", "Library/assets"),
        ("developer", "Developer", "Diagnostics"),
        ("hr", "HR", "Staff + attendance"),
        ("support", "Support", "Users + support tools"),
    ]
    for key, name, desc in roles:
        op.execute(
            sa.text(
                "INSERT INTO staff_roles (key, name, description, created_at) VALUES (:k,:n,:d, now()) ON CONFLICT (key) DO NOTHING"
            ).bindparams(k=key, n=name, d=desc)
        )

    # Seed permissions (coarse-grained for Phase 1).
    perms = [
        ("*", "All permissions", "Grants access to everything."),
        ("admin.manage", "Manage staff/roles", "Create and manage staff accounts/roles."),
        ("blog.read", "Read blog", "View blog posts/comments."),
        ("blog.write", "Write blog", "Create/edit blog posts."),
        ("blog.publish", "Publish blog", "Publish/schedule blog posts."),
        ("newsletter.send", "Send newsletter", "Create and send newsletters."),
        ("push.send", "Send push", "Create and send push campaigns."),
        ("users.read", "Read users", "View users."),
        ("users.write", "Write users", "Suspend/update users."),
        ("recipes.write", "Write recipes", "Create/update recipes."),
        ("tips.write", "Write tips", "Create/update tips."),
        ("challenge.write", "Write challenge", "Create/update challenge."),
        ("logs.read", "Read logs", "View system/mobile logs."),
        ("system.read", "Read system health", "View system health."),
        ("backups.run", "Run backups", "Create/download backups."),
        ("email.send", "Send emails", "Send user emails from admin."),
    ]
    for key, name, desc in perms:
        op.execute(
            sa.text(
                "INSERT INTO staff_permissions (key, name, description, created_at) VALUES (:k,:n,:d, now()) ON CONFLICT (key) DO NOTHING"
            ).bindparams(k=key, n=name, d=desc)
        )

    # Give admin role "*" permission.
    op.execute(
        sa.text(
            """
            INSERT INTO staff_role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM staff_roles r, staff_permissions p
            WHERE r.key='admin' AND p.key='*'
            ON CONFLICT DO NOTHING
            """
        )
    )

    # Migrate existing admin_users -> staff_users with admin role.
    # If admin_users doesn't exist (very early DB), this will no-op.
    op.execute(
        sa.text(
            """
            INSERT INTO staff_users (email, hashed_password, timezone, is_active, created_at, updated_at)
            SELECT email, hashed_password, 'UTC', true, created_at, created_at
            FROM admin_users
            WHERE email IS NOT NULL
            ON CONFLICT (email) DO NOTHING
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO staff_user_roles (user_id, role_id)
            SELECT u.id, r.id
            FROM staff_users u
            JOIN staff_roles r ON r.key='admin'
            WHERE u.email IN (SELECT email FROM admin_users)
            ON CONFLICT DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_staff_audit_logs_created_at", table_name="staff_audit_logs")
    op.drop_index("ix_staff_audit_logs_actor_id", table_name="staff_audit_logs")
    op.drop_table("staff_audit_logs")

    op.drop_index("ix_staff_role_permissions_permission_id", table_name="staff_role_permissions")
    op.drop_index("ix_staff_role_permissions_role_id", table_name="staff_role_permissions")
    op.drop_table("staff_role_permissions")

    op.drop_index("ix_staff_user_roles_role_id", table_name="staff_user_roles")
    op.drop_index("ix_staff_user_roles_user_id", table_name="staff_user_roles")
    op.drop_table("staff_user_roles")

    op.drop_index("ix_staff_permissions_key", table_name="staff_permissions")
    op.drop_table("staff_permissions")

    op.drop_index("ix_staff_roles_key", table_name="staff_roles")
    op.drop_table("staff_roles")

    op.drop_index("ix_staff_users_email", table_name="staff_users")
    op.drop_table("staff_users")

