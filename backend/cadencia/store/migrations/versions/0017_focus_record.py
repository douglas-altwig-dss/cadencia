"""Focus records: what people worked on, written by hand, read by the focus-shift detection.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 is a baseline built from `create_all`, so a fresh database already has this table.
    if "focus_record" not in set(sa.inspect(op.get_bind()).get_table_names()):
        op.create_table(
            "focus_record",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("account_id", sa.String(128), nullable=False),
            sa.Column("at", sa.Date(), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("tags", sa.JSON(), nullable=True),
            sa.Column("themes", sa.JSON(), nullable=True),
            sa.Column("issue_key", sa.String(64), nullable=True),
            sa.Column("author", sa.String(255), nullable=True),
            sa.Column("created_at", UTCDateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_focus_record"),
        )
        op.create_index("ix_focus_record_account_id", "focus_record", ["account_id"])
        op.create_index("ix_focus_record_at", "focus_record", ["at"])


def downgrade() -> None:
    op.drop_table("focus_record")
