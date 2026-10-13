"""Variables as their own entity, optionally bound to a template, with a slide scope.

`fixed_text` held both the identity of a placeholder and its value in one row, was implicitly
shared by every template, and could not say anything about a single slide. This splits the two and
adds the slide level (RF-52). Existing rows migrate into the new tables unchanged in meaning.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-20
"""

from __future__ import annotations

from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    # 0001 is a baseline built from `create_all`, so a fresh database already has both tables.
    if "variable" not in tables:
        op.create_table(
            "variable",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(64), nullable=False),
            sa.Column("label", sa.String(160), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("template_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id", name="pk_variable"),
            sa.UniqueConstraint("template_id", "name", name="uq_variable_template_id"),
        )
        op.create_index("ix_variable_name", "variable", ["name"])
        op.create_index("ix_variable_template_id", "variable", ["template_id"])
    if "variable_value" not in tables:
        op.create_table(
            "variable_value",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("variable_id", sa.Integer(), nullable=False),
            sa.Column("scope", sa.String(10), nullable=False),
            sa.Column("scope_key", sa.String(64), nullable=False),
            sa.Column("value", sa.Text(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id", name="pk_variable_value"),
            sa.UniqueConstraint("variable_id", "scope", "scope_key", name="uq_variable_value_variable_id"),
        )
        op.create_index("ix_variable_value_variable_id", "variable_value", ["variable_id"])

    if "fixed_text" not in tables:
        return
    bind = op.get_bind()
    rows = (
        bind.execute(sa.text("SELECT scope, scope_key, name, label, value, updated_at FROM fixed_text"))
        .mappings()
        .all()
    )
    now = datetime.now(UTC)
    ids: dict[str, int] = {}
    for row in rows:
        name = row["name"]
        if name not in ids:
            bind.execute(
                sa.text(
                    "INSERT INTO variable (name, label, description, template_id, created_at) "
                    "VALUES (:name, :label, '', NULL, :created)"
                ),
                {"name": name, "label": row["label"] or "", "created": now},
            )
            ids[name] = bind.execute(
                sa.text("SELECT id FROM variable WHERE template_id IS NULL AND name = :name"),
                {"name": name},
            ).scalar_one()
        bind.execute(
            sa.text(
                "INSERT INTO variable_value (variable_id, scope, scope_key, value, updated_at) "
                "VALUES (:vid, :scope, :key, :value, :updated)"
            ),
            {
                "vid": ids[name],
                "scope": row["scope"],
                "key": row["scope_key"] or "",
                "value": row["value"] or "",
                "updated": row["updated_at"] or now,
            },
        )
    op.drop_table("fixed_text")


def downgrade() -> None:
    """Rebuilds `fixed_text`. Template-bound variables and slide values have no place there and
    are dropped, which is the honest cost of going back."""
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
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "INSERT INTO fixed_text (scope, scope_key, name, label, value, updated_at) "
            "SELECT vv.scope, vv.scope_key, v.name, v.label, vv.value, vv.updated_at "
            "FROM variable_value vv JOIN variable v ON v.id = vv.variable_id "
            "WHERE v.template_id IS NULL AND vv.scope <> 'slide'"
        )
    )
    op.drop_table("variable_value")
    op.drop_table("variable")
