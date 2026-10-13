"""Apresentação workflow: run kinds, review, audience, timing, and read-only share links.

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

RUN_COLUMNS = (
    ("kind", sa.String(10), "entrega"),
    ("parent_run_id", sa.String(32), None),
    ("audience", sa.String(40), ""),
    ("review_status", sa.String(12), "rascunho"),
    ("reviewed_by", sa.String(255), None),
    ("reviewed_at", UTCDateTime(), None),
    ("review_note", sa.Text(), ""),
    ("seconds", sa.Float(), "0"),
)


def upgrade() -> None:
    # 0001 is a baseline built from `create_all`, so a fresh database already has all of this.
    inspector = sa.inspect(op.get_bind())
    existing = {c["name"] for c in inspector.get_columns("report_run")}
    with op.batch_alter_table("report_run") as batch:
        for name, kind, default in RUN_COLUMNS:
            if name not in existing:
                batch.add_column(
                    sa.Column(
                        name,
                        kind,
                        nullable=default is None,
                        server_default=default if default is not None else None,
                    )
                )
    if "deck_share" not in set(inspector.get_table_names()):
        op.create_table(
            "deck_share",
            sa.Column("token", sa.String(64), nullable=False),
            sa.Column("run_id", sa.String(32), nullable=False),
            sa.Column("created_at", UTCDateTime(), nullable=False),
            sa.Column("expires_at", UTCDateTime(), nullable=False),
            sa.Column("created_by", sa.String(255), nullable=True),
            sa.Column("revoked_at", UTCDateTime(), nullable=True),
            sa.Column("views", sa.Integer(), nullable=False, server_default="0"),
            sa.PrimaryKeyConstraint("token", name="pk_deck_share"),
        )
        op.create_index("ix_deck_share_run_id", "deck_share", ["run_id"])


def downgrade() -> None:
    op.drop_table("deck_share")
    with op.batch_alter_table("report_run") as batch:
        for name, _kind, _default in reversed(RUN_COLUMNS):
            batch.drop_column(name)
