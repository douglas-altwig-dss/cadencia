"""Audience Q&A during a presentation (Slides parity): a question asked against a run.

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 is a baseline built from `create_all`, so a fresh database already has this table.
    if "report_question" not in set(sa.inspect(op.get_bind()).get_table_names()):
        op.create_table(
            "report_question",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("run_id", sa.String(32), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("author", sa.String(255), nullable=True),
            sa.Column("asked_at", UTCDateTime(), nullable=False),
            sa.Column("answered_at", UTCDateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id", name="pk_report_question"),
        )
        op.create_index("ix_report_question_run_id", "report_question", ["run_id"])


def downgrade() -> None:
    op.drop_table("report_question")
