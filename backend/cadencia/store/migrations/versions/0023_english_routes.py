"""Web-app URLs are English (docs/routes.md): stored saved views move to the new paths and keys.

``saved_view.path`` holds a screen ("/fluxo", "/pessoas/abc") and ``saved_view.query`` its filters
without the "?". Paths and query keys are rewritten here; old ``?tab=`` values are left alone,
because the web app normalises them at runtime for every URL, stored or typed. Nothing else stores
a web-app path: the Home layout keeps tile types and board ids, ``notify.*`` keeps channels and
outcomes, and links in notifications and share answers are built when they are sent.

The mapping is a frozen copy on purpose: a migration must keep meaning what it meant when it ran,
whatever the application's own route table becomes later.

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-14
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None

#: Old web-app path → new one. Matched as whole leading segments, longest first.
PATHS: tuple[tuple[str, str], ...] = (
    ("/configuracao/assistente", "/settings/wizard"),
    ("/apresentar/plateia", "/present/audience"),
    ("/configuracao", "/settings"),
    ("/apresentacao", "/presentation"),
    ("/compartilhado", "/shared"),
    ("/timeline-foco", "/focus-timeline"),
    ("/minha-semana", "/my-week"),
    ("/pessoas", "/people"),
    ("/inicio", "/getting-started"),
    ("/fluxo", "/flow"),
)

#: Old query key → new one.
QUERY_KEYS: dict[str, str] = {
    "modelo": "template",
    "forma": "shape",
    "assistente": "wizard",
    "ausencias": "absences",
    "funcoes": "roles",
    "perfil": "profile",
    "canal": "channel",
}


def _swap_path(path: str, pairs: tuple[tuple[str, str], ...]) -> str:
    for old, new in sorted(pairs, key=lambda pair: len(pair[0]), reverse=True):
        if path == old or path.startswith(f"{old}/"):
            return new + path[len(old) :]
    return path


def _swap_query(query: str, keys: dict[str, str]) -> str:
    if not query:
        return query
    pairs = [part.partition("=") for part in query.split("&")]
    present = {key for key, _sep, _value in pairs}
    # When both spellings are already there, the one being renamed to wins (docs/routes.md).
    return "&".join(
        f"{keys.get(key, key)}{sep}{value}"
        for key, sep, value in pairs
        if not (key in keys and keys[key] in present)
    )


def rewrite(path: str, query: str, *, reverse: bool = False) -> tuple[str, str]:
    """``(path, query)`` with old paths and query keys renamed (or the other way, for downgrade)."""
    pairs = tuple((new, old) for old, new in PATHS) if reverse else PATHS
    keys = {new: old for old, new in QUERY_KEYS.items()} if reverse else QUERY_KEYS
    # A path stored with its own query string is rewritten the same way, in both halves.
    path, sep, inline = path.partition("?")
    path = _swap_path(path, pairs) + (f"{sep}{_swap_query(inline, keys)}" if sep else "")
    return path, _swap_query(query, keys)


saved_view = sa.table(
    "saved_view",
    sa.column("id", sa.Integer),
    sa.column("path", sa.String),
    sa.column("query", sa.Text),
)


def _migrate(*, reverse: bool) -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.select(saved_view.c.id, saved_view.c.path, saved_view.c.query)).all()
    for row_id, path, query in rows:
        new_path, new_query = rewrite(path or "", query or "", reverse=reverse)
        if (new_path, new_query) != (path or "", query or ""):
            bind.execute(
                saved_view.update()
                .where(saved_view.c.id == row_id)
                .values(path=new_path[:255], query=new_query)
            )


def upgrade() -> None:
    _migrate(reverse=False)


def downgrade() -> None:
    _migrate(reverse=True)
