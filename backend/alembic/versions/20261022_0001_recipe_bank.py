"""recipes: recipe bank keys (unique title_key, GIN-indexed ingredient_keys, times_served)

Revision ID: 20261022_0001
Revises: 20261021_0002
Create Date: 2026-10-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20261022_0001"
down_revision = "20261021_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.services.recipe_keys import ingredient_keys, title_key

    op.add_column("recipes", sa.Column("title_key", sa.String(length=160), nullable=True))
    op.add_column("recipes", sa.Column("ingredient_keys", postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column("recipes", sa.Column("times_served", sa.Integer(), nullable=False, server_default="0"))

    # Backfill existing recipes; if two share a title, only the oldest keeps the key.
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, name, ingredients FROM recipes ORDER BY id")).fetchall()
    seen: set[str] = set()
    for rid, name, ingredients in rows:
        tk = title_key(name)
        keys = ingredient_keys(ingredients if isinstance(ingredients, list) else [])
        conn.execute(
            sa.text("UPDATE recipes SET title_key = :tk, ingredient_keys = :keys WHERE id = :id"),
            {"tk": tk if tk and tk not in seen else None, "keys": keys, "id": rid},
        )
        if tk:
            seen.add(tk)

    op.create_index(
        "ux_recipes_title_key", "recipes", ["title_key"], unique=True, postgresql_where=sa.text("title_key IS NOT NULL")
    )
    op.create_index("ix_recipes_ingredient_keys", "recipes", ["ingredient_keys"], postgresql_using="gin")
    op.create_index("ix_recipes_status_meal_type", "recipes", ["status", "meal_type"])


def downgrade() -> None:
    op.drop_index("ix_recipes_status_meal_type", table_name="recipes")
    op.drop_index("ix_recipes_ingredient_keys", table_name="recipes")
    op.drop_index("ux_recipes_title_key", table_name="recipes")
    op.drop_column("recipes", "times_served")
    op.drop_column("recipes", "ingredient_keys")
    op.drop_column("recipes", "title_key")
