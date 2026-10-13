"""Space as a grouping level above board.

A board's Jira location is the team's space, so ``board.project_*`` becomes ``board.space_*`` and
the spaces themselves get a table of their own.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "space" not in inspector.get_table_names():
        op.create_table(
            "space",
            sa.Column("key", sa.String(64), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("discovered_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("key", name="pk_space"),
        )
    # 0001 is a baseline built from `create_all`, so a fresh database already has the new names.
    columns = _columns("board")
    if "project_key" in columns and "space_key" not in columns:
        with op.batch_alter_table("board") as batch:
            batch.alter_column("project_key", new_column_name="space_key")
            batch.alter_column("project_name", new_column_name="space_name")
        op.create_index("ix_board_space_key", "board", ["space_key"])
    # Backfill the spaces the known boards already point at.
    op.execute(
        sa.text(
            "INSERT INTO space (key, name) "
            "SELECT DISTINCT space_key, COALESCE(space_name, space_key) FROM board "
            "WHERE space_key IS NOT NULL AND space_key <> '' "
            "AND space_key NOT IN (SELECT key FROM space)"
        )
    )


def downgrade() -> None:
    columns = _columns("board")
    if "space_key" in columns and "project_key" not in columns:
        op.drop_index("ix_board_space_key", table_name="board")
        with op.batch_alter_table("board") as batch:
            batch.alter_column("space_key", new_column_name="project_key")
            batch.alter_column("space_name", new_column_name="project_name")
    op.drop_table("space")
