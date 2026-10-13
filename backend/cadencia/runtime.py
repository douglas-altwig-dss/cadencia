"""Process-wide wiring: database preparation and the default session factory."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from cadencia.config import Settings, get_settings
from cadencia.store.db import create_all, make_engine, make_session_factory, upgrade


def prepare_database(settings: Settings, engine: Engine | None = None) -> None:
    url = settings.database_url
    if url.startswith("sqlite") and ":memory:" not in url:
        Path(url.split(":///", 1)[1]).parent.mkdir(parents=True, exist_ok=True)
    if ":memory:" in url:
        create_all(engine or make_engine(url))
    else:
        upgrade(url)
    settings.templates_dir.mkdir(parents=True, exist_ok=True)
    settings.decks_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def default_sessions() -> sessionmaker[Session]:
    settings = get_settings()
    engine = make_engine(settings.database_url)
    prepare_database(settings, engine)
    return make_session_factory(engine)
