"""Focus, again: people registered by hand, several people per note, and explicit focus shifts.

A note used to belong to one Jira account (``account_id``). It now holds person keys in ``people``, so one
note can cover several people. The existing notes are carried over as ``jira:<account_id>``.

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    # 0017 always leaves focus_record in place, so this only adds what is missing.
    if "focus_person" not in set(sa.inspect(bind).get_table_names()):
        op.create_table(
            "focus_person",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("cargo", sa.String(120), nullable=True),
            sa.Column("color", sa.String(7), nullable=True),
            sa.Column("created_at", UTCDateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_focus_person"),
        )

    columns = {c["name"] for c in sa.inspect(bind).get_columns("focus_record")}
    with op.batch_alter_table("focus_record") as batch:
        if "people" not in columns:
            batch.add_column(sa.Column("people", sa.JSON(), nullable=True))
        if "kind" not in columns:
            batch.add_column(sa.Column("kind", sa.String(16), nullable=False, server_default="nota"))
        if "shift_from" not in columns:
            batch.add_column(sa.Column("shift_from", sa.String(120), nullable=True))
        if "shift_to" not in columns:
            batch.add_column(sa.Column("shift_to", sa.String(120), nullable=True))

    if "account_id" in columns:
        table = sa.table("focus_record", sa.column("id", sa.Integer), sa.column("account_id", sa.String))
        people = sa.table("focus_record", sa.column("id", sa.Integer), sa.column("people", sa.JSON))
        for row in bind.execute(sa.select(table.c.id, table.c.account_id)).all():
            bind.execute(
                people.update().where(people.c.id == row.id).values(people=[f"jira:{row.account_id}"])
            )
        with op.batch_alter_table("focus_record") as batch:
            batch.drop_index("ix_focus_record_account_id")
            batch.drop_column("account_id")


def downgrade() -> None:
    with op.batch_alter_table("focus_record") as batch:
        batch.add_column(sa.Column("account_id", sa.String(128), nullable=True))
        batch.drop_column("shift_to")
        batch.drop_column("shift_from")
        batch.drop_column("kind")
        batch.drop_column("people")
    op.drop_table("focus_person")
