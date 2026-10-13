"""A lease table, so only one collection runs at a time across processes.

The API guarded collections with an asyncio lock, which the scheduler (another container) never
saw: a collection started from the UI, the hourly one and a checkpoint's could all overlap, and
the UI's "coletando" flag knew only about its own.

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 is a baseline built from `create_all`, so a fresh database already has the table.
    if "lease" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "lease",
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("holder", sa.String(64), nullable=True),
        sa.Column("expires_at", UTCDateTime(), nullable=True),
        sa.PrimaryKeyConstraint("name", name="pk_lease"),
    )


def downgrade() -> None:
    op.drop_table("lease")
