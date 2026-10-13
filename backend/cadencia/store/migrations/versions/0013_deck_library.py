"""Apresentação library: reusable blocks, asset labels and tags, editor presence.

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 is a baseline built from `create_all`, so a fresh database already has all of this.
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    asset_columns = {c["name"] for c in inspector.get_columns("report_asset")}
    with op.batch_alter_table("report_asset") as batch:
        if "label" not in asset_columns:
            batch.add_column(sa.Column("label", sa.String(160), nullable=False, server_default=""))
        if "tags" not in asset_columns:
            batch.add_column(sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"))
    if "deck_block" not in tables:
        op.create_table(
            "deck_block",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("author", sa.String(255), nullable=True),
            sa.Column("shapes", sa.JSON(), nullable=False),
            sa.Column("width", sa.Integer(), nullable=False),
            sa.Column("height", sa.Integer(), nullable=False),
            sa.Column("created_at", UTCDateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_deck_block"),
        )
    if "editor_presence" not in tables:
        op.create_table(
            "editor_presence",
            sa.Column("template_id", sa.Integer(), nullable=False),
            sa.Column("author", sa.String(255), nullable=False),
            sa.Column("slide_key", sa.String(64), nullable=False),
            sa.Column("seen_at", UTCDateTime(), nullable=False),
            sa.PrimaryKeyConstraint("template_id", "author", name="pk_editor_presence"),
        )


def downgrade() -> None:
    op.drop_table("editor_presence")
    op.drop_table("deck_block")
    with op.batch_alter_table("report_asset") as batch:
        batch.drop_column("tags")
        batch.drop_column("label")
