"""A variable's default belongs to its registration, not to the rendering code.

Defaults used to be implicit: a name with no value anywhere resolved to the empty string wherever
it was used, so a variable nobody had registered and a variable nobody had filled in produced the
same blank slide. Generation now refuses both, and a variable that genuinely wants a fallback
declares it here, once. ``NULL`` means "no default", which is not the same as an empty default.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    # 0001 is a baseline built from `create_all`, so a fresh database already has the column.
    if "default" in {c["name"] for c in inspector.get_columns("variable")}:
        return
    op.add_column("variable", sa.Column("default", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("variable", "default")
