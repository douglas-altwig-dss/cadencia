"""Manual edits to the generated deck, and the images they place on it.

Edits live beside the mapping rather than inside the .pptx, so regenerating the data replays them
instead of losing them (RF-46).

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    # 0001 is a baseline built from `create_all`, so a fresh database already has both.
    if "deck_edit" not in tables:
        op.create_table(
            "deck_edit",
            sa.Column("template_id", sa.Integer(), autoincrement=False, nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("edits", sa.JSON(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("template_id", name="pk_deck_edit"),
        )
    if "report_asset" not in tables:
        op.create_table(
            "report_asset",
            sa.Column("id", sa.String(64), nullable=False),
            sa.Column("filename", sa.String(255), nullable=False),
            sa.Column("content_type", sa.String(80), nullable=False),
            sa.Column("width", sa.Integer(), nullable=False),
            sa.Column("height", sa.Integer(), nullable=False),
            sa.Column("path", sa.Text(), nullable=False),
            sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_report_asset"),
        )


def downgrade() -> None:
    op.drop_table("report_asset")
    op.drop_table("deck_edit")
