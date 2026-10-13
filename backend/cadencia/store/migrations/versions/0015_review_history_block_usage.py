"""Review audit trail (every approve/reject kept, not only the latest) and block usage counts.

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 is a baseline built from `create_all`, so a fresh database already has all of this.
    inspector = sa.inspect(op.get_bind())
    run_columns = {c["name"] for c in inspector.get_columns("report_run")}
    with op.batch_alter_table("report_run") as batch:
        if "review_history" not in run_columns:
            batch.add_column(sa.Column("review_history", sa.JSON(), nullable=False, server_default="[]"))
    block_columns = {c["name"] for c in inspector.get_columns("deck_block")}
    with op.batch_alter_table("deck_block") as batch:
        if "usage_count" not in block_columns:
            batch.add_column(sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"))
        if "last_used_at" not in block_columns:
            batch.add_column(sa.Column("last_used_at", UTCDateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("deck_block") as batch:
        batch.drop_column("last_used_at")
        batch.drop_column("usage_count")
    with op.batch_alter_table("report_run") as batch:
        batch.drop_column("review_history")
