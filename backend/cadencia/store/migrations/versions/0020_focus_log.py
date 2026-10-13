"""The "Timeline de foco" log's own tables: its revision, team, themes and lines.

Nothing here refers to Jira. The tables are independent of the collected data on purpose.

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "focus_log_state" not in existing:
        op.create_table(
            "focus_log_state",
            sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("updated_at", UTCDateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_focus_log_state"),
        )
    if "focus_log_person" not in existing:
        op.create_table(
            "focus_log_person",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("nome", sa.String(length=120), nullable=False),
            sa.Column("cargo", sa.String(length=120), nullable=False),
            sa.Column("cor", sa.String(length=7), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_focus_log_person"),
        )
    if "focus_log_theme" not in existing:
        op.create_table(
            "focus_log_theme",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("nome", sa.String(length=120), nullable=False),
            sa.Column("cor", sa.String(length=7), nullable=False),
            sa.Column("palavras", sa.Text(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_focus_log_theme"),
            sa.UniqueConstraint("nome", name="uq_focus_log_theme_nome"),
        )
    if "focus_log_entry" not in existing:
        op.create_table(
            "focus_log_entry",
            sa.Column("uid", sa.String(length=64), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("tipo", sa.String(length=16), nullable=False),
            sa.Column("nome", sa.String(length=120), nullable=False),
            sa.Column("data", sa.Date(), nullable=False),
            sa.Column("registro", sa.Text(), nullable=False),
            sa.Column("de_tema", sa.String(length=120), nullable=True),
            sa.Column("para_tema", sa.String(length=120), nullable=True),
            sa.Column("icone", sa.String(length=16), nullable=True),
            sa.Column("cor_destaque", sa.String(length=7), nullable=True),
            sa.Column("estilo_linha", sa.String(length=32), nullable=True),
            sa.PrimaryKeyConstraint("uid", name="pk_focus_log_entry"),
        )


def downgrade() -> None:
    op.drop_table("focus_log_entry")
    op.drop_table("focus_log_theme")
    op.drop_table("focus_log_person")
    op.drop_table("focus_log_state")
