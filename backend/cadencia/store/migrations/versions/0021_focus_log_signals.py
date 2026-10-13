"""The focus log's signals become the team's own: a table for them, seeded with the four that were fixed in
the code and five new ones.

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None

#: The starting catalogue. Frozen here on purpose: a later change to the defaults must not rewrite history.
SEMENTE = [
    ("Bloqueado", "#EF4444", "bloquead", 'o texto cita bloqueio ("bloqueado", "bloqueada")'),
    ("Aguardando", "#F59E0B", "aguard", 'o texto cita espera ("aguardando", "aguardar")'),
    (
        "Mudança de prioridade",
        "#3B82F6",
        "troca de prioridade, realocad",
        "o texto cita troca de prioridade ou realocação",
    ),
    ("Prioridade 1", "#8B5CC4", "prioridade numero 1, prioridade 1", 'o texto cita "prioridade número 1"'),
    ("Impedimento", "#DC2626", "impedimento, impedido", "o texto cita impedimento ou impedido"),
    ("Urgente", "#E11D48", "urgente, urgencia", "o texto cita urgência"),
    ("Em risco", "#EA580C", "em risco, risco de atraso", "o texto cita risco de atraso"),
    (
        "Dependência externa",
        "#0EA5E9",
        "depende de, dependencia externa",
        "o texto cita dependência de outra equipe",
    ),
    ("Retrabalho", "#0D9488", "retrabalho, refazer, reabrir", "o texto cita retrabalho ou refazer"),
]


def upgrade() -> None:
    bind = op.get_bind()
    if "focus_log_signal" not in set(sa.inspect(bind).get_table_names()):
        op.create_table(
            "focus_log_signal",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("nome", sa.String(length=120), nullable=False),
            sa.Column("cor", sa.String(length=7), nullable=False),
            sa.Column("palavras", sa.Text(), nullable=False),
            sa.Column("gatilho", sa.String(length=200), nullable=False),
            sa.PrimaryKeyConstraint("id", name="pk_focus_log_signal"),
            sa.UniqueConstraint("nome", name="uq_focus_log_signal_nome"),
        )
    table = sa.table(
        "focus_log_signal",
        sa.column("position", sa.Integer),
        sa.column("nome", sa.String),
        sa.column("cor", sa.String),
        sa.column("palavras", sa.Text),
        sa.column("gatilho", sa.String),
    )
    if bind.execute(sa.select(sa.func.count()).select_from(table)).scalar() == 0:
        op.bulk_insert(
            table,
            [
                {"position": i, "nome": nome, "cor": cor, "palavras": palavras, "gatilho": gatilho}
                for i, (nome, cor, palavras, gatilho) in enumerate(SEMENTE)
            ],
        )


def downgrade() -> None:
    op.drop_table("focus_log_signal")
