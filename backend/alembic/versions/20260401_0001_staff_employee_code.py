"""staff employee code

Revision ID: 20260401_0001
Revises: 20260331_0004
Create Date: 2026-04-01
"""

from __future__ import annotations

import secrets

from alembic import op
import sqlalchemy as sa


revision = "20260401_0001"
down_revision = "20260331_0004"
branch_labels = None
depends_on = None


def _make_code() -> str:
    return f"GF-EMP-{secrets.token_hex(4).upper()}"


def upgrade() -> None:
    op.add_column("staff_users", sa.Column("employee_code", sa.String(length=32), nullable=True))
    op.create_index("ix_staff_users_employee_code", "staff_users", ["employee_code"], unique=True)

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id FROM staff_users WHERE employee_code IS NULL")).fetchall()
    if rows:
        used = set(
            r[0]
            for r in bind.execute(sa.text("SELECT employee_code FROM staff_users WHERE employee_code IS NOT NULL")).fetchall()
            if r and r[0]
        )
        for (staff_id,) in rows:
            code = _make_code()
            # Extremely low collision risk, but keep it safe.
            while code in used:
                code = _make_code()
            used.add(code)
            bind.execute(sa.text("UPDATE staff_users SET employee_code = :code WHERE id = :id"), {"code": code, "id": staff_id})

    op.alter_column("staff_users", "employee_code", existing_type=sa.String(length=32), nullable=False)


def downgrade() -> None:
    op.drop_index("ix_staff_users_employee_code", table_name="staff_users")
    op.drop_column("staff_users", "employee_code")

