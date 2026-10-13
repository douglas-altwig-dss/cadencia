"""Epic plan: roles chosen by hand for a subtask.

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 is a baseline built from `create_all`, so a fresh database already has this table.
    if "subtask_role" not in set(sa.inspect(op.get_bind()).get_table_names()):
        op.create_table(
            "subtask_role",
            sa.Column("issue_key", sa.String(64), nullable=False),
            sa.Column("role_ids", sa.JSON(), nullable=False),
            sa.Column("updated_at", UTCDateTime(), nullable=False),
            sa.PrimaryKeyConstraint("issue_key", name="pk_subtask_role"),
        )


def downgrade() -> None:
    op.drop_table("subtask_role")
