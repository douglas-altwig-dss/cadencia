"""Collection errors are kept as message records, so each reader sees them in its own language.

``board_run.error_i18n`` and ``board.last_error_i18n`` hold ``{"cause", "action", "message"}``, each a
``{"$msg": key, "params": {...}}`` record; ``collector_run.error_i18n`` holds one record. The text
columns beside them keep the pt-BR mirror, so older readers, a rollback and ad-hoc SQL still work.
``NULL`` is a row from before this change: readers fall back to its stored text.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

COLUMNS = (
    ("board_run", "error_i18n"),
    ("board", "last_error_i18n"),
    ("collector_run", "error_i18n"),
)


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for table, column in COLUMNS:
        # 0001 is a baseline built from `create_all`, so a fresh database already has the column.
        if column in {c["name"] for c in inspector.get_columns(table)}:
            continue
        op.add_column(table, sa.Column(column, sa.JSON(), nullable=True))


def downgrade() -> None:
    for table, column in COLUMNS:
        with op.batch_alter_table(table) as batch:
            batch.drop_column(column)
