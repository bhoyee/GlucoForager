"""add user public id

Revision ID: 20260118_0005
Revises: 20260118_0004
Create Date: 2026-01-18 00:00:05.000000

"""
from alembic import op
import sqlalchemy as sa
import uuid


# revision identifiers, used by Alembic.
revision = "20260118_0005"
down_revision = "20260118_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("public_id", sa.String(), nullable=True))
    op.create_index("ix_users_public_id", "users", ["public_id"], unique=True)

    connection = op.get_bind()
    users_table = sa.table(
        "users",
        sa.column("id", sa.Integer),
        sa.column("public_id", sa.String),
    )
    rows = connection.execute(sa.select(users_table.c.id, users_table.c.public_id)).fetchall()
    for row in rows:
        if row.public_id:
            continue
        connection.execute(
            users_table.update()
            .where(users_table.c.id == row.id)
            .values(public_id=str(uuid.uuid4()))
        )


def downgrade() -> None:
    op.drop_index("ix_users_public_id", table_name="users")
    op.drop_column("users", "public_id")
