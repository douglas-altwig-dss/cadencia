"""Shared helpers for tests that run the real collector against the demo Jira instance."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from cadencia.collector.service import Collector
from cadencia.config import Settings
from cadencia.demo import DemoJira
from cadencia.i18n import DEFAULT_LOCALE, configure_default_locale, current_locale, using_locale
from cadencia.jira.client import JiraClient
from cadencia.store import repo
from cadencia.store.db import session_scope

NOW = datetime(2026, 9, 10, 18, 0, tzinfo=UTC)  # Thursday 15:00 in São Paulo, sprint week 2

#: The suite speaks pt-BR by default (docs/i18n-backend.md, 4.2): the catalogue's pt-BR entries are
#: verbatim copies of the old strings, so the existing assertions check the conversion. Every
#: TestClient sends this; a test about another language passes its own header.
PT_BR = {"Accept-Language": "pt-BR"}


@contextmanager
def process_locale(locale: str) -> Iterator[None]:
    """Run a block as if ``CADENCIA_LOCALE`` were ``locale``: the process default (scheduler-like
    threads) and the ambient locale (this thread and the tasks it starts), restored afterwards."""
    configure_default_locale(locale)
    try:
        with using_locale(locale):
            yield
    finally:
        configure_default_locale(DEFAULT_LOCALE)


def make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "database_url": "sqlite:///:memory:",
        "data_dir": tmp_path / "data",
        "jira_base_url": "https://demo.atlassian.net",
        "jira_email": "bot@demo.example",
        "jira_api_token": "token-de-demonstracao",
        "log_json": False,
        # The test's own locale (pt-BR unless marked), so CADENCIA_LOCALE agrees with the ambient one.
        "locale": current_locale(),
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


async def _no_sleep(_seconds: float) -> None:
    return None


async def collect_demo(
    demo: DemoJira,
    sessions: sessionmaker[Session],
    settings: Settings,
    *,
    mode: str = "full",
    select: tuple[int, ...] = (1, 2, 3),
    now: datetime = NOW,
) -> dict[str, Any]:
    async with JiraClient.from_settings(settings, transport=demo.transport, sleep=_no_sleep) as client:
        collector = Collector(client, sessions, settings, now=lambda: now)
        await collector.discover()
        with session_scope(sessions) as session:
            repo.set_selected_boards(session, select)
        return await collector.collect(mode=mode)
