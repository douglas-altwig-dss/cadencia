"""Baseline schema.

Revision ID: 0001
Revises:
Create Date: 2026-09-15
"""

from __future__ import annotations

from alembic import op

from cadencia.store.schema import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Baseline: the schema module is the source of truth at this revision. Later revisions are
    # generated with `alembic revision --autogenerate` against it.
    Base.metadata.create_all(op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind())
