"""Per-project fixed text for the deck.

Named static blocks (a project definition, a disclaimer) scoped to a space, a board or the whole
instance, so one slide template can be reused across projects (RF-45).

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 is a baseline built from `create_all`, so a fresh database already has the table.
    if "fixed_text" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "fixed_text",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("scope", sa.String(10), nullable=False),
        sa.Column("scope_key", sa.String(64), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("label", sa.String(160), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_fixed_text"),
        sa.UniqueConstraint("scope", "scope_key", "name", name="uq_fixed_text_scope"),
    )
    op.create_index("ix_fixed_text_name", "fixed_text", ["name"])


def downgrade() -> None:
    op.drop_table("fixed_text")
