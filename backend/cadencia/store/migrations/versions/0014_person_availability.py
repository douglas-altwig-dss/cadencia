"""Per-person availability: their own day length and the share of their time given to the boards.

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 is a baseline built from `create_all`, so a fresh database already has this table.
    if "person_availability" not in set(sa.inspect(op.get_bind()).get_table_names()):
        op.create_table(
            "person_availability",
            sa.Column("account_id", sa.String(128), nullable=False),
            sa.Column("hours_per_day", sa.Float(), nullable=True),
            sa.Column("allocation_pct", sa.Integer(), nullable=False),
            sa.Column("updated_at", UTCDateTime(), nullable=False),
            sa.PrimaryKeyConstraint("account_id", name="pk_person_availability"),
        )


def downgrade() -> None:
    op.drop_table("person_availability")
