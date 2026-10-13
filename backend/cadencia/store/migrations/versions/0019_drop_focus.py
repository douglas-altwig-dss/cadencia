"""Drop the Foco module's tables: its people, notes and focus shifts.

The module is gone, so nothing reads or writes these tables any more. Upgrading drops them; downgrading
cannot bring the rows back, so restore from a backup if the notes are needed again.

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    # 0017 and 0018 create these only when missing, so a fresh database may not have them at this point.
    if "focus_record" in existing:
        op.drop_table("focus_record")
    if "focus_person" in existing:
        op.drop_table("focus_person")


def downgrade() -> None:
    raise NotImplementedError(
        "As tabelas do Foco não são recriadas: os registros não voltam. Restaure do backup se precisar."
    )
