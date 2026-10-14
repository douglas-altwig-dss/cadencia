"""T5 of docs/i18n-backend.md: collection errors, Jira errors, notifications, the store, the seed.

Stored failures are message records rendered by each reader; notifications speak CADENCIA_LOCALE
whoever triggers them; seeded roles take CADENCIA_LOCALE once and are data afterwards.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

from cadencia import notify
from cadencia.api.app import create_app
from cadencia.api.deps import clock
from cadencia.errors import Invalid
from cadencia.i18n import Msg, catalog, render
from cadencia.jira import errors as jira_errors
from cadencia.jira.errors import JiraAuthError, JiraError, JiraServerError, error_record
from cadencia.store import repo
from cadencia.store import schema as s
from cadencia.store.db import make_engine, session_scope, upgrade
from tests.support import NOW, PT_BR, collect_demo, make_settings, process_locale

DE = {"Accept-Language": "de-DE"}
EN = {"Accept-Language": "en-US"}

JIRA_CODES = sorted(
    cls.code for cls in vars(jira_errors).values() if isinstance(cls, type) and issubclass(cls, JiraError)
)


@pytest.fixture
def app(sessions, settings):
    app = create_app(settings, sessions)
    app.dependency_overrides[clock] = lambda: NOW
    return app


# ----------------------------------------------------------------------------- Jira errors


def test_every_jira_error_code_has_a_cause_and_an_action_in_every_locale():
    assert len(JIRA_CODES) == 9
    for locale in ("en-US", "pt-BR", "de-DE"):
        keys = catalog(locale)
        for code in JIRA_CODES:
            assert f"{code}.cause" in keys and f"{code}.action" in keys, (locale, code)


@pytest.mark.locale("de-DE")
def test_a_jira_error_speaks_the_ambient_language():
    error = JiraServerError(Msg("jira.message.http", status=503, path="/rest/x", detail="indisponível"))
    assert error.cause == "interner Fehler in Jira"
    assert str(error) == "HTTP 503 bei /rest/x: indisponível"  # Jira's own words stay untouched
    assert render(Msg.from_json(error.record()["cause"]), "pt-BR") == "erro interno do Jira"
    assert JiraAuthError("HTTP 401").message == "HTTP 401"  # plain text still works


def test_the_connection_test_error_follows_the_request(app, monkeypatch):
    from cadencia.api import routes_setup

    async def failing(*_args, **_kwargs):
        raise JiraAuthError(Msg("jira.message.auth", detail="nope"))

    monkeypatch.setattr(routes_setup, "run_connection_test", failing)
    with TestClient(app) as client:
        en = client.post("/api/connection/test", headers=EN).json()["error"]
        de = client.post("/api/connection/test", headers=DE).json()["error"]
    assert (
        en["cause"] == "invalid credential"
        and en["message"] == "Jira refused the credential (HTTP 401): nope"
    )
    assert de["cause"] == "ungültige Anmeldedaten"


# ----------------------------------------------------------------------------- stored failures


def _fail_board_two(sessions):
    """Board 2's last run failed with a Jira error, recorded the way the collector records it."""
    error = JiraServerError(Msg("jira.message.http", status=500, path="/rest/agile/1.0/board/2", detail="x"))
    with session_scope(sessions) as session:
        repo.start_board_run(session, "r-fail", 2)
        repo.finish_board_run(
            session,
            "r-fail",
            2,
            status="failed",
            counters={},
            started_at=NOW,
            error=error.record(),
        )


def _status_board(client, headers, board_id):
    body = client.get("/api/status", headers=headers).json()
    return next(b for b in body["boards"] if b["board"]["id"] == board_id)


def test_a_stored_failure_renders_in_the_reader_language_and_keeps_a_pt_br_mirror(
    demo, sessions, settings, app
):
    asyncio.run(collect_demo(demo, sessions, settings))
    _fail_board_two(sessions)
    with session_scope(sessions) as session:
        row = repo.last_board_run(session, 2)
        assert row.cause == "erro interno do Jira"  # the mirror, for old readers and SQL
        assert row.error == "HTTP 500 em /rest/agile/1.0/board/2: x"
        assert row.error_i18n["cause"]["$msg"] == "jira.server.cause"
        assert session.get(s.BoardRow, 2).last_error_i18n["message"]["$msg"] == "jira.message.http"
    with TestClient(app) as client:
        de = _status_board(client, DE, 2)
        en = _status_board(client, EN, 2)
        pt = _status_board(client, PT_BR, 2)
        boards = client.get("/api/boards", headers=DE).json()["items"]
    assert de["last_run"]["cause"] == "interner Fehler in Jira"
    assert de["last_run"]["error"] == "HTTP 500 bei /rest/agile/1.0/board/2: x"
    assert en["last_run"]["action"] == "Jira answered with an error; try again in a few minutes."
    assert pt["last_run"]["cause"] == "erro interno do Jira"
    assert next(b for b in boards if b["id"] == 2)["last_error"] == "HTTP 500 bei /rest/agile/1.0/board/2: x"


def test_a_row_from_before_the_records_shows_its_stored_text(demo, sessions, settings, app):
    asyncio.run(collect_demo(demo, sessions, settings))
    with session_scope(sessions) as session:
        repo.start_board_run(session, "r-old", 2)
        row = session.get(s.BoardRunRow, ("r-old", 2))
        row.status, row.finished_at = "failed", NOW
        row.error, row.cause, row.action = "texto antigo", "causa antiga", "ação antiga"
        session.get(s.BoardRow, 2).last_error = "texto antigo"
    with TestClient(app) as client:
        de = _status_board(client, DE, 2)
        boards = client.get("/api/boards", headers=DE).json()["items"]
    assert (de["last_run"]["error"], de["last_run"]["cause"], de["last_run"]["action"]) == (
        "texto antigo",
        "causa antiga",
        "ação antiga",
    )
    assert next(b for b in boards if b["id"] == 2)["last_error"] == "texto antigo"


async def test_the_collector_records_a_failed_board_as_messages(demo, sessions, settings):
    demo.fail_boards = {2}
    result = await collect_demo(demo, sessions, settings)
    failed = next(b for b in result["boards"] if b["board_id"] == 2)
    assert failed["error"]["cause"] == "erro interno do Jira"  # ambient (pt-BR) here
    with session_scope(sessions) as session:
        record = session.get(s.BoardRow, 2).last_error_i18n
    assert record["cause"] == {"$msg": "jira.server.cause", "params": {}}
    assert render(Msg.from_json(record["action"]), "de-DE").startswith("Jira hat mit einem Fehler")


def test_an_unexpected_failure_keeps_the_exception_words_and_translates_the_rest():
    record = error_record(Msg("collect.unexpected.cause"), Msg("collect.unexpected.action"), "boom")
    assert record["message"] == "boom"
    assert render(Msg.from_json(record["cause"]), "en-US") == "unexpected error"
    assert render(Msg.from_json(record["cause"]), "pt-BR") == "erro inesperado"


@pytest.mark.locale("de-DE")
def test_the_freshness_of_a_cached_board_renders_its_record(demo, sessions, settings):
    from cadencia.analytics.data import load_board

    asyncio.run(collect_demo(demo, sessions, settings))
    _fail_board_two(sessions)
    with session_scope(sessions) as session:
        data = load_board(session, 2)
        data.last_error_record = session.get(s.BoardRow, 2).last_error_i18n
        data.last_error = session.get(s.BoardRow, 2).last_error
        assert data.freshness(NOW)["last_error"].startswith("HTTP 500 bei")
    from cadencia.i18n import using_locale

    with using_locale("en-US"):
        assert data.freshness(NOW)["last_error"].startswith("HTTP 500 at")


def test_the_migration_adds_and_removes_the_record_columns(tmp_path):
    from alembic import command
    from alembic.config import Config

    from cadencia.store.db import MIGRATIONS_DIR

    url = f"sqlite:///{tmp_path / 'cadencia.db'}"
    upgrade(url)
    engine = make_engine(url)

    def columns(table):
        return {c["name"] for c in inspect(engine).get_columns(table)}

    assert "error_i18n" in columns("board_run") and "last_error_i18n" in columns("board")
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", url)
    command.downgrade(config, "0021")
    assert "error_i18n" not in columns("board_run") | columns("collector_run")
    assert "last_error_i18n" not in columns("board")
    with engine.begin() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0021"
    upgrade(url)
    assert "error_i18n" in columns("collector_run")


# ----------------------------------------------------------------------------- store messages


def test_store_refusals_speak_the_request_language(sessions):
    with session_scope(sessions) as session, pytest.raises(Invalid) as info:
        repo.save_view(session, name="", path="/x", query="", pinned=False)
    assert str(info.value) == "dê um nome à visão"
    assert render(info.value.msg, "en-US") == "give the view a name"
    assert render(info.value.msg, "de-DE") == "Geben Sie der Ansicht einen Namen"


# ----------------------------------------------------------------------------- notifications


def _capture(monkeypatch):
    posted: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        posted.append(json.loads(request.content))
        return httpx.Response(200)

    real = httpx.Client

    def client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real(*args, **kwargs)

    monkeypatch.setattr(notify.httpx, "Client", client)
    return posted


def test_a_channel_test_goes_out_in_cadencia_locale_whatever_the_request_says(
    tmp_path, sessions, monkeypatch
):
    posted = _capture(monkeypatch)
    app = create_app(make_settings(tmp_path, locale="de-DE"), sessions)
    with session_scope(sessions) as session:
        notify.save_channels(
            session,
            [
                {"id": "hook", "kind": "slack", "target": "https://hooks.example/slack"},
                {"id": "mail", "kind": "email", "target": "time@example.com"},
            ],
        )
    with TestClient(app) as client:
        client.post("/api/notifications/channels/hook/test", headers=PT_BR)
        mail = client.post("/api/notifications/channels/mail/test", headers=EN).json()["result"]
        view = client.get("/api/notifications", headers=PT_BR).json()
    assert posted[0]["text"].startswith("*Test von Cadência*\nWenn Sie dies lesen")
    # The outcome is for the person who clicked: their language, on the spot and on the screen.
    assert (
        mail["error"] == "SMTP not configured: set the mail server in Settings → E-mail & links"
        and "error_msg" not in mail
    )
    last = next(c for c in view["channels"] if c["id"] == "mail")["last"]
    assert (
        last["error"] == "SMTP não configurado: informe o servidor em Configuração → E-mail e links"
        and "error_msg" not in last
    )
    assert [e["label"] for e in view["events"]] == [
        "apresentação gerada",
        "resumo de riscos",
        "coleta com falha",
    ]
    with TestClient(app) as client:
        assert client.get("/api/notifications", headers=DE).json()["events"][0]["label"] == (
            "Foliensatz erstellt"
        )


def test_a_stored_outcome_from_before_the_records_keeps_its_text():
    old = {"channel": "x", "ok": False, "error": "HTTP 404: não"}
    assert notify.outcome_view(old, "de-DE")["error"] == "HTTP 404: não"


def test_the_deck_message_is_built_from_keys(sessions, tmp_path, monkeypatch):
    posted = _capture(monkeypatch)
    run = SimpleNamespace(
        status="invalid",
        validation={"errors": [{}], "warnings": [{}, {}], "slides": 4},
        template_id=1,
        id=7,
        reference_at=datetime(2026, 9, 8, 15, 0, tzinfo=UTC),
    )
    with session_scope(sessions) as session:
        notify.save_channels(session, [{"kind": "webhook", "target": "https://hooks.example/d"}])
        for locale in ("en-US", "pt-BR"):
            settings = make_settings(tmp_path, locale=locale)
            notify.deliver(session, settings, notify.deck_message(settings, run, "Semanal"))
    en, pt = posted
    assert en["title"] == "Deck generated: Semanal"
    assert en["text"] == "Failed validation (1 error); open it to see what is missing."
    assert en["fields"] == {"Reference": "09/08/2026 15:00 UTC", "Slides": "4", "Warnings": "2"}
    assert pt["text"] == "Reprovada na validação (1 erro(s)); abra para ver o que falta."
    assert pt["fields"]["Referência"] == "08/09/2026 15:00 UTC"


@pytest.mark.locale("de-DE")
def test_the_digest_is_written_in_cadencia_locale(demo, sessions, tmp_path):
    settings = make_settings(tmp_path, locale="en-US")
    asyncio.run(collect_demo(demo, sessions, settings))
    bodies = []
    transport = httpx.MockTransport(lambda r: bodies.append(json.loads(r.content)) or httpx.Response(200))
    with session_scope(sessions) as session:
        notify.save_channels(
            session, [{"kind": "webhook", "target": "https://hooks.example/d", "events": ["digest"]}]
        )
        result = notify.send_digest(session, settings, NOW, transport=transport)
    assert result["sent"] and bodies[0]["title"].startswith("New risks — Produto Digital: ")
    assert "CAD-14" in bodies[0]["text"]


# ----------------------------------------------------------------------------- seeded roles


@pytest.mark.parametrize(
    ("locale", "first"),
    [("pt-BR", "Arquiteto de Software"), ("en-US", "Software Architect"), ("de-DE", "Softwarearchitekt")],
)
def test_roles_are_seeded_once_in_cadencia_locale(sessions, locale, first):
    with process_locale(locale), session_scope(sessions) as session:
        assert repo.list_roles(session)[0].name == first
    with process_locale("de-DE" if locale != "de-DE" else "en-US"), session_scope(sessions) as session:
        assert repo.list_roles(session)[0].name == first  # seeded rows are data: never retranslated


def test_the_request_language_does_not_name_the_seeded_roles(tmp_path, sessions):
    app = create_app(make_settings(tmp_path, locale="pt-BR"), sessions)
    with TestClient(app) as client:
        names = [r["nome"] for r in client.get("/api/roles", headers=DE).json()["items"]]
    assert names[0] == "Arquiteto de Software" and "Infraestrutura" in names
