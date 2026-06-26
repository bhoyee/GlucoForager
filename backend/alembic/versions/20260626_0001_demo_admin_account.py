"""seed demo admin account

Revision ID: 20260626_0001
Revises: 20260625_0001
Create Date: 2026-06-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20260626_0001"
down_revision = "20260625_0001"
branch_labels = None
depends_on = None


DEMO_EMAIL = "demo@glucoforager.com"
DEMO_PASSWORD_HASH = "$pbkdf2-sha256$29000$sFbK.Z.zdk6J8X7vfW8tRQ$PL6IHCem74zdQDOR9725JglrT6Dz2NpW9kkFWRZFLz4"


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO staff_users (
                email,
                hashed_password,
                timezone,
                is_active,
                full_name,
                country,
                employee_code,
                mfa_enabled,
                deleted_at,
                created_at,
                updated_at
            )
            VALUES (
                :email,
                :password_hash,
                'UTC',
                true,
                'Demo Account',
                'GB',
                'DEMO-ADMIN',
                false,
                NULL,
                now(),
                now()
            )
            ON CONFLICT (email) DO UPDATE SET
                hashed_password = EXCLUDED.hashed_password,
                timezone = COALESCE(staff_users.timezone, EXCLUDED.timezone),
                is_active = true,
                full_name = COALESCE(staff_users.full_name, EXCLUDED.full_name),
                country = COALESCE(staff_users.country, EXCLUDED.country),
                employee_code = COALESCE(staff_users.employee_code, EXCLUDED.employee_code),
                mfa_enabled = false,
                deleted_at = NULL,
                updated_at = now()
            """
        ).bindparams(email=DEMO_EMAIL, password_hash=DEMO_PASSWORD_HASH)
    )
    op.execute(
        sa.text(
            """
            INSERT INTO staff_user_roles (user_id, role_id)
            SELECT u.id, r.id
            FROM staff_users u
            JOIN staff_roles r ON r.key = 'demo_admin'
            WHERE u.email = :email
            ON CONFLICT DO NOTHING
            """
        ).bindparams(email=DEMO_EMAIL)
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM staff_user_roles
            WHERE user_id IN (SELECT id FROM staff_users WHERE email = :email)
              AND role_id IN (SELECT id FROM staff_roles WHERE key = 'demo_admin')
            """
        ).bindparams(email=DEMO_EMAIL)
    )
    op.execute(sa.text("DELETE FROM staff_users WHERE email = :email").bindparams(email=DEMO_EMAIL))