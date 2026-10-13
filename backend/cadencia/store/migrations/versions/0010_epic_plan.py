"""Epic plan: roles, team members, generated plans, and the issue fields they read.

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from cadencia.store.schema import UTCDateTime

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 is a baseline built from `create_all`, so a fresh database already has all of this.
    inspector = sa.inspect(op.get_bind())
    existing = set(inspector.get_table_names())
    issue_columns = {c["name"] for c in inspector.get_columns("issue")}
    with op.batch_alter_table("issue") as batch:
        if "original_estimate_hours" not in issue_columns:
            batch.add_column(sa.Column("original_estimate_hours", sa.Float(), nullable=True))
        if "description" not in issue_columns:
            batch.add_column(sa.Column("description", sa.Text(), nullable=False, server_default=""))
    if "role" not in existing:
        op.create_table(
            "role",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("color", sa.String(16), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("labels", sa.JSON(), nullable=False),
            sa.Column("created_at", UTCDateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_role"),
            sa.UniqueConstraint("name", name="uq_role_name"),
        )
    if "team_member" not in existing:
        op.create_table(
            "team_member",
            sa.Column("account_id", sa.String(128), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint("account_id", name="pk_team_member"),
        )
    if "member_role" not in existing:
        op.create_table(
            "member_role",
            sa.Column("account_id", sa.String(128), nullable=False),
            sa.Column("role_id", sa.Integer(), nullable=False),
            sa.Column("seniority", sa.String(10), nullable=False),
            sa.PrimaryKeyConstraint("account_id", "role_id", name="pk_member_role"),
        )
        op.create_index("ix_member_role_role_id", "member_role", ["role_id"])
    if "epic_plan_run" not in existing:
        op.create_table(
            "epic_plan_run",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("epic_key", sa.String(64), nullable=False),
            sa.Column("algorithm", sa.String(40), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("gap", sa.Float(), nullable=True),
            sa.Column("makespan_days", sa.Integer(), nullable=False),
            sa.Column("member_ids", sa.JSON(), nullable=False),
            sa.Column("parameters", sa.JSON(), nullable=False),
            sa.Column("allocations", sa.JSON(), nullable=False),
            sa.Column("fingerprint", sa.String(64), nullable=False),
            sa.Column("seconds", sa.Float(), nullable=False),
            sa.Column("created_at", UTCDateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_epic_plan_run"),
        )
        op.create_index("ix_epic_plan_run_epic_key", "epic_plan_run", ["epic_key"])


def downgrade() -> None:
    op.drop_table("epic_plan_run")
    op.drop_table("member_role")
    op.drop_table("team_member")
    op.drop_table("role")
    with op.batch_alter_table("issue") as batch:
        batch.drop_column("description")
        batch.drop_column("original_estimate_hours")
