"""Saved views (RF-75), deck versions (RF-87) and slide comments (RF-93).

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 is a baseline built from `create_all`, so a fresh database already has these tables.
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "saved_view" not in existing:
        op.create_table(
            "saved_view",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("path", sa.String(255), nullable=False),
            sa.Column("query", sa.Text(), nullable=False),
            sa.Column("pinned", sa.Boolean(), nullable=False),
            sa.Column("created_at", UTCDateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_saved_view"),
        )
    if "deck_version" not in existing:
        op.create_table(
            "deck_version",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("template_id", sa.Integer(), nullable=False),
            sa.Column("kind", sa.String(20), nullable=False),
            sa.Column("label", sa.String(255), nullable=False),
            sa.Column("auto", sa.Boolean(), nullable=False),
            sa.Column("author", sa.String(255), nullable=True),
            sa.Column("document", sa.JSON(), nullable=False),
            sa.Column("created_at", UTCDateTime(), nullable=False),
            sa.Column("updated_at", UTCDateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_deck_version"),
        )
        op.create_index("ix_deck_version_template_id", "deck_version", ["template_id"])
    if "deck_comment" not in existing:
        op.create_table(
            "deck_comment",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("template_id", sa.Integer(), nullable=False),
            sa.Column("origin_slide_id", sa.Integer(), nullable=False),
            sa.Column("shape_key", sa.String(64), nullable=True),
            sa.Column("parent_id", sa.Integer(), nullable=True),
            sa.Column("author", sa.String(255), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", UTCDateTime(), nullable=False),
            sa.Column("resolved_at", UTCDateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id", name="pk_deck_comment"),
        )
        op.create_index("ix_deck_comment_template_id", "deck_comment", ["template_id"])


def downgrade() -> None:
    op.drop_table("deck_comment")
    op.drop_table("deck_version")
    op.drop_table("saved_view")
