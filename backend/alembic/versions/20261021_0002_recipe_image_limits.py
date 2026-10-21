"""app_settings: recipe photo limits to 60/day Premium, 12/day free

A fridge scan makes 3 recipe photos, so the old 10/3 limits allowed only ~3 Premium
scans (1 free) a day before recipes fell back to placeholders. Admins can still
change these on the admin Notifications page.

Revision ID: 20261021_0002
Revises: 20261021_0001
Create Date: 2026-10-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20261021_0002"
down_revision = "20261021_0001"
branch_labels = None
depends_on = None

LIMITS = {
    "recipe_images_premium_daily_limit": ("60", "10"),
    "recipe_images_free_daily_limit": ("12", "3"),
}


def _set(key: str, value: str) -> None:
    conn = op.get_bind()
    params = {"k": key, "v": value}
    updated = conn.execute(
        sa.text("UPDATE app_settings SET value = :v, updated_at = now() WHERE key = :k"), params
    ).rowcount
    if not updated:
        conn.execute(sa.text("INSERT INTO app_settings (key, value, updated_at) VALUES (:k, :v, now())"), params)


def upgrade() -> None:
    for key, (new, _old) in LIMITS.items():
        _set(key, new)


def downgrade() -> None:
    for key, (_new, old) in LIMITS.items():
        _set(key, old)
