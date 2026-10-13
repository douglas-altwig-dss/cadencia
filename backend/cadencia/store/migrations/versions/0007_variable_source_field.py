"""A variable can read its value from a Jira field instead of being typed per space.

Registration already said what a variable *is* and what it falls back to; this adds where it can
come from. ``NULL`` is the previous behaviour — a variable somebody writes values for — so every
existing row keeps meaning exactly what it meant.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    # 0001 is a baseline built from `create_all`, so a fresh database already has the column.
    if "source_field" in {c["name"] for c in inspector.get_columns("variable")}:
        return
    op.add_column("variable", sa.Column("source_field", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("variable", "source_field")
