"""Shared helpers for tests that run the real collector against the demo Jira instance."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from cadencia.collector.service import Collector
from cadencia.config import Settings
from cadencia.demo import DemoJira
from cadencia.jira.client import JiraClient
from cadencia.store import repo
from cadencia.store.db import session_scope

NOW = datetime(2026, 9, 10, 18, 0, tzinfo=UTC)  # Thursday 15:00 in São Paulo, sprint week 2


def make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "database_url": "sqlite:///:memory:",
        "data_dir": tmp_path / "data",
        "jira_base_url": "https://demo.atlassian.net",
        "jira_email": "bot@demo.example",
        "jira_api_token": "token-de-demonstracao",
        "log_json": False,
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
