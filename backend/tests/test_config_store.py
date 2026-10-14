"""Runtime configuration saved in the database (docs/config-store.md)."""

from __future__ import annotations

import io
import json
from contextlib import redirect_stdout
from datetime import timedelta

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from cadencia import cli, config_store
from cadencia.api import routes_config
from cadencia.api.app import create_app
from cadencia.collector import scheduler
from cadencia.errors import Invalid
from cadencia.store import repo
from cadencia.store.db import session_scope
from tests.support import PT_BR, make_settings

NO_JIRA = {"jira_base_url": "", "jira_email": "", "jira_api_token": ""}


def ok(response):
    assert response.status_code < 300, response.text
    return response.json()


def fields(view):
    return {f["key"]: f for group in view["groups"] for f in group["fields"]}


def raw_row(sessions):
    with session_scope(sessions) as session:
        return repo.get_setting(session, config_store.CONFIG_KEY)


def save(settings, sessions, **values):
    with session_scope(sessions) as session:
        config_store.update(settings, session, values)


def effective(settings, sessions):
    return config_store.effective_from(settings, sessions)


@pytest.fixture
def client(sessions, settings):
    with TestClient(create_app(settings, sessions), headers=PT_BR) as test_client:
        yield test_client


# ------------------------------------------------------------------ the overlay


def test_the_database_wins_over_the_environment_which_wins_over_the_default(tmp_path, sessions, monkeypatch):
    monkeypatch.setenv("CADENCIA_HISTORY_DAYS", "200")
    # The dev container's .env sets this one; the test needs it to fall through to the default.
    monkeypatch.delenv("CADENCIA_CHECKPOINT_HOUR", raising=False)
    base = make_settings(tmp_path, timezone="Europe/Berlin")
    assert base.history_days == 200  # from the environment
    save(base, sessions, timezone="Asia/Tokyo", history_days=30, history_sprints=4)

    current = effective(base, sessions)
    assert current.timezone == "Asia/Tokyo"
    # Re-validating the overlay must not let the environment reclaim a saved field.
    assert current.history_days == 30
    assert current.history_sprints == 4
    assert current.checkpoint_hour == 18  # nobody set it: the default
    assert current.jira_base_url == base.jira_base_url  # only in the environment

    with session_scope(sessions) as session:
        view = fields(config_store.view(base, session))
    assert view["timezone"]["source"] == "database" and view["timezone"]["env_value_differs"]
    assert view["history_sprints"]["source"] == "database"
    assert not view["history_sprints"]["env_value_differs"]  # the environment never set it
    assert view["jira_base_url"]["source"] == "environment"
    assert view["checkpoint_hour"] == {
        "key": "checkpoint_hour",
        "kind": "hour",
        "value": 18,
        "is_set": True,
        "source": "default",
        "default": 18,
        "min": 0,
        "max": 23,
        "env_value_differs": False,
    }


def test_nothing_saved_answers_the_environment_itself(settings, sessions):
    assert effective(settings, sessions) is settings


def test_get_config_has_every_group_and_the_bootstrap_read_only(client):
    view = ok(client.get("/api/config"))
    assert [g["id"] for g in view["groups"]] == list(config_store.GROUPS)
    assert set(fields(view)) == set(config_store.REGISTRY)
    bootstrap = {b["key"]: b for b in view["bootstrap"]}
    assert set(bootstrap) == set(config_store.BOOTSTRAP)
    assert bootstrap["secret_key"] == {"key": "secret_key", "value": False, "source": "default"}
    assert bootstrap["api_token"] == {"key": "api_token", "value": False, "source": "default"}
    assert bootstrap["cors_origins"]["value"] == ["http://localhost:5173"]
    assert view["jira_configured"] is True
    assert "jira_api_token" in view["importable"]

    # The first secret saved generates the key file.
    view = ok(client.put("/api/config", json={"values": {"smtp_password": "smtp-segredo"}}))
    bootstrap = {b["key"]: b for b in view["bootstrap"]}
    assert bootstrap["secret_key"] == {"key": "secret_key", "value": True, "source": "file"}


def test_the_bootstrap_says_whether_the_env_secrets_are_set(tmp_path, sessions):
    base = make_settings(tmp_path, api_token="token-da-api", secret_key=Fernet.generate_key().decode())
    with session_scope(sessions) as session:
        bootstrap = {b["key"]: b for b in config_store.view(base, session)["bootstrap"]}
    assert bootstrap["api_token"] == {"key": "api_token", "value": True, "source": "environment"}
    assert bootstrap["secret_key"] == {"key": "secret_key", "value": True, "source": "environment"}


def test_a_null_is_an_empty_value_where_the_kind_allows_one(client, sessions):
    view = ok(client.put("/api/config", json={"values": {"public_url": None, "smtp_host": None}}))
    assert fields(view)["public_url"]["source"] == "database" and fields(view)["public_url"]["value"] == ""
    assert raw_row(sessions) == {"public_url": "", "smtp_host": ""}
    for key in ("history_days", "timezone", "smtp_starttls", "locale"):
        response = client.put("/api/config", json={"values": {key: None}})
        assert response.status_code == 400 and response.json()["detail"]["field"] == key
    assert raw_row(sessions) == {"public_url": "", "smtp_host": ""}


def test_the_database_url_password_is_masked(tmp_path, sessions):
    base = make_settings(tmp_path, database_url="postgresql://cadencia:hunter22@db/cadencia")
    with session_scope(sessions) as session:
        bootstrap = {b["key"]: b for b in config_store.view(base, session)["bootstrap"]}
    assert "hunter22" not in bootstrap["database_url"]["value"]
    assert bootstrap["database_url"]["value"].startswith("postgresql://cadencia:***@db")


# ------------------------------------------------------------------ validation


def test_a_refused_value_stores_nothing_and_names_the_field(client, sessions):
    response = client.put(
        "/api/config", json={"values": {"timezone": "Europe/Berlin", "checkpoint_hour": 25}}
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["field"] == "checkpoint_hour"
    assert detail["cause"] and "checkpoint_hour" in detail["message"]
    assert raw_row(sessions) is None
    assert fields(ok(client.get("/api/config")))["timezone"]["source"] != "database"


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("timezone", "Marte/Base"),
        ("locale", "fr-FR"),
        ("jira_base_url", "ftp://x"),
        ("jira_email", "not-an-email"),
        ("history_days", 2),
        ("jira_timeout_seconds", 1000),
        ("jira_max_retries", 2.5),
        ("smtp_starttls", "maybe"),
        ("smtp_port", True),
        ("ai_model", 3),
        ("database_url", "sqlite:///x.db"),
        ("no_such_setting", 1),
    ],
)
def test_each_kind_refuses_what_it_cannot_use(client, sessions, key, value):
    response = client.put("/api/config", json={"values": {key: value}})
    assert response.status_code == 400, response.text
    assert response.json()["detail"]["field"] == key
    assert raw_row(sessions) is None


def test_values_are_normalised_before_they_are_stored(settings, sessions):
    save(settings, sessions, locale="de_de", smtp_starttls="false", history_days="90", ai_timeout_seconds=30)
    stored = raw_row(sessions)
    assert stored["locale"] == "de-DE" and stored["smtp_starttls"] is False and stored["history_days"] == 90
    assert isinstance(stored["ai_timeout_seconds"], float)


def test_the_refusal_speaks_the_request_language(client):
    response = client.put(
        "/api/config", json={"values": {"checkpoint_weekday": 9}}, headers={"Accept-Language": "de-DE"}
    )
    assert "Wochentag" in response.json()["detail"]["message"]


# ------------------------------------------------------------------ secrets


def test_a_secret_is_encrypted_at_rest_and_never_returned(client, sessions, settings):
    plain = "jira-token-que-nao-pode-vazar"
    view = ok(client.put("/api/config", json={"values": {"jira_api_token": plain}}))
    token = fields(view)["jira_api_token"]
    assert token["value"] is None and token["is_set"] and token["source"] == "database"
    assert token["default"] is None

    stored = raw_row(sessions)
    assert plain not in json.dumps(stored)
    assert set(stored["jira_api_token"]) == {"$enc"}
    assert plain not in client.get("/api/config").text
    assert effective(settings, sessions).jira_api_token.get_secret_value() == plain

    key_file = settings.data_dir / config_store.SECRET_FILE
    assert key_file.stat().st_mode & 0o777 == 0o600


def test_the_environment_key_encrypts_when_set(tmp_path, sessions):
    key = Fernet.generate_key().decode()
    base = make_settings(tmp_path, secret_key=key)
    save(base, sessions, smtp_password="smtp-segredo")
    assert (
        Fernet(key.encode()).decrypt(raw_row(sessions)["smtp_password"]["$enc"].encode()) == b"smtp-segredo"
    )
    assert not (base.data_dir / config_store.SECRET_FILE).exists()


def test_an_invalid_environment_key_is_refused_at_boot(tmp_path):
    with pytest.raises(ValueError):
        make_settings(tmp_path, secret_key="curta")


def test_an_undecryptable_secret_is_not_set_rather_than_an_error(client, sessions, settings):
    with session_scope(sessions) as session:
        repo.set_setting(
            session,
            config_store.CONFIG_KEY,
            {"jira_api_token": {"$enc": "lixo"}, "smtp_password": {"$enc": "lixo"}, "history_days": 45},
        )
    view = ok(client.get("/api/config"))
    assert fields(view)["jira_api_token"]["source"] == "environment"  # falls back to the env's
    assert fields(view)["smtp_password"] == {
        **fields(view)["smtp_password"],
        "is_set": False,
        "source": "default",
    }
    assert fields(view)["history_days"]["value"] == 45
    assert ok(client.get("/api/health"))["jira_configured"]


def test_a_lost_key_leaves_the_secret_unset(tmp_path, sessions):
    first = make_settings(tmp_path / "a", **NO_JIRA)
    save(first, sessions, jira_api_token="token-antigo")
    other = make_settings(tmp_path / "b", **NO_JIRA)  # another data dir: another generated key
    assert effective(other, sessions).jira_api_token.get_secret_value() == ""


def test_an_empty_or_null_secret_clears_the_saved_one(client):
    ok(client.put("/api/config", json={"values": {"jira_api_token": "token-salvo"}}))
    view = ok(client.put("/api/config", json={"values": {"jira_api_token": ""}}))
    assert fields(view)["jira_api_token"]["source"] == "environment"
    ok(client.put("/api/config", json={"values": {"jira_api_token": "token-salvo"}}))
    view = ok(client.put("/api/config", json={"values": {"jira_api_token": None, "history_days": 50}}))
    assert "jira_api_token" not in raw_row(client.app.state.sessions)
    assert fields(view)["jira_api_token"]["source"] == "environment"
    assert fields(view)["history_days"]["source"] == "database"


# ------------------------------------------------------------------ delete and import


def test_delete_forgets_the_saved_value(client):
    ok(client.put("/api/config", json={"values": {"timezone": "Europe/Berlin", "history_days": 30}}))
    view = ok(client.delete("/api/config/timezone"))
    assert fields(view)["timezone"]["source"] in {"environment", "default"}
    assert fields(view)["history_days"]["source"] == "database"
    assert client.delete("/api/config/no_such_setting").json()["detail"]["field"] == "no_such_setting"
    assert client.delete("/api/config/api_token").status_code == 400


def test_import_env_copies_what_the_environment_sets(tmp_path, sessions):
    base = make_settings(tmp_path, timezone="Europe/Berlin", smtp_port=2525)
    app = create_app(base, sessions)
    with TestClient(app, headers=PT_BR) as client:
        view = ok(client.post("/api/config/import-env"))
    assert {"timezone", "smtp_port", "jira_base_url", "jira_email", "jira_api_token"} <= set(view["imported"])
    assert "history_days" not in view["imported"]  # nobody set it
    assert view["importable"] == []
    assert fields(view)["timezone"]["source"] == "database"
    stored = raw_row(sessions)
    assert stored["timezone"] == "Europe/Berlin" and stored["smtp_port"] == 2525
    assert base.jira_api_token.get_secret_value() not in json.dumps(stored)


def test_import_env_leaves_a_value_the_app_refuses_in_the_environment(tmp_path, sessions):
    base = make_settings(tmp_path, history_days=2000)  # Settings allows it, the app's range does not
    with session_scope(sessions) as session:
        imported = config_store.import_env(base, session)
    assert "history_days" not in imported
    assert "history_days" not in raw_row(sessions)


# ------------------------------------------------------------------ the wizard's connection test


def test_the_jira_test_uses_the_draft_and_saves_nothing(client, sessions, monkeypatch):
    seen = []

    async def fake_test(settings, _sessions):
        seen.append(settings)
        return {"ok": True, "identity": {"name": "Bot"}, "permissions": {}}

    monkeypatch.setattr(routes_config, "run_connection_test", fake_test)
    body = ok(client.post("/api/config/jira/test", json={"jira_base_url": "https://outra.atlassian.net"}))
    assert body["ok"]
    assert seen[-1].jira_base_url == "https://outra.atlassian.net"
    assert seen[-1].jira_api_token.get_secret_value() == "token-de-demonstracao"  # omitted: the one in use
    assert raw_row(sessions) is None
    assert fields(ok(client.get("/api/config")))["jira_base_url"]["value"] == "https://demo.atlassian.net"

    ok(client.put("/api/config", json={"values": {"jira_api_token": "token-salvo"}}))
    ok(client.post("/api/config/jira/test", json={"jira_api_token": ""}))
    assert seen[-1].jira_api_token.get_secret_value() == "token-salvo"
    ok(client.post("/api/config/jira/test", json={"jira_api_token": "token-rascunho"}))
    assert seen[-1].jira_api_token.get_secret_value() == "token-rascunho"
    assert "token-rascunho" not in json.dumps(raw_row(sessions))


def test_the_jira_test_says_what_is_missing(tmp_path, sessions, monkeypatch):
    monkeypatch.setattr(routes_config, "run_connection_test", pytest.fail)
    app = create_app(make_settings(tmp_path, **NO_JIRA), sessions)
    with TestClient(app, headers={"Accept-Language": "en-US"}) as client:
        body = ok(client.post("/api/config/jira/test", json={"jira_base_url": "https://x.atlassian.net"}))
        assert body["ok"] is False
        assert body["error"]["message"] == "Fill in before testing: e-mail, API token."
        assert body["error"]["cause"] and body["error"]["action"]
        bad = ok(client.post("/api/config/jira/test", json={"jira_base_url": "x"}))
        assert bad["ok"] is False and "jira_base_url" in bad["error"]["message"]


# ------------------------------------------------------------------ consumers read it live


def test_requests_read_saved_values_without_a_restart(tmp_path, sessions):
    app = create_app(make_settings(tmp_path, **NO_JIRA), sessions)
    with TestClient(app, headers=PT_BR) as client:
        assert ok(client.get("/api/health"))["jira_configured"] is False
        view = ok(
            client.put(
                "/api/config",
                json={
                    "values": {
                        "jira_base_url": "https://salva.atlassian.net",
                        "jira_email": "bot@salva.example",
                        "jira_api_token": "token-salvo",
                        "timezone": "Europe/Lisbon",
                    }
                },
            )
        )
        assert view["jira_configured"] is True
        health = ok(client.get("/api/health"))
        assert health["jira_configured"] is True and health["timezone"] == "Europe/Lisbon"
        assert health["jira_base_url"] == "https://salva.atlassian.net"
        assert ok(client.get("/api/status"))["jira_configured"] is True


def test_the_scheduler_follows_saved_values(settings, sessions, monkeypatch):
    sched = scheduler.build_scheduler(settings, sessions)
    assert sched.get_job("incremental").trigger.interval == timedelta(minutes=60)
    scheduler._sync(sched, settings, sessions)
    assert {j.id for j in sched.get_jobs() if j.id.startswith("checkpoint:")} == {
        "checkpoint:4:18:America/Sao_Paulo"
    }

    save(
        settings,
        sessions,
        collect_interval_minutes=15,
        checkpoint_weekday=1,
        checkpoint_hour=9,
        timezone="Europe/Berlin",
        history_days=45,
    )
    scheduler._sync(sched, settings, sessions)
    assert sched.get_job("incremental").trigger.interval == timedelta(minutes=15)
    assert {j.id for j in sched.get_jobs() if j.id.startswith("checkpoint:")} == {
        "checkpoint:1:9:Europe/Berlin"
    }
    # A job registered with the environment's settings reads the saved ones when it fires.
    assert sched.get_job("checkpoint:1:9:Europe/Berlin").args[0] is settings
    ran = []
    monkeypatch.setattr(scheduler, "_collect", lambda current, *_a, **_kw: ran.append(current))
    scheduler._incremental(settings, sessions)
    assert ran[-1].history_days == 45 and ran[-1].timezone == "Europe/Berlin"


# ------------------------------------------------------------------ CLI


def run_cli(monkeypatch, settings, sessions, *argv):
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    monkeypatch.setattr(cli, "_sessions", lambda: sessions)
    out = io.StringIO()
    with redirect_stdout(out):
        cli.main(list(argv))
    return json.loads(out.getvalue())


def test_the_cli_shows_sets_unsets_and_imports(monkeypatch, settings, sessions):
    shown = run_cli(monkeypatch, settings, sessions, "config", "set", "history_days", "30")
    assert fields(shown)["history_days"]["value"] == 30
    run_cli(monkeypatch, settings, sessions, "config", "set", "jira_api_token", "token-pela-cli")
    shown = run_cli(monkeypatch, settings, sessions, "config", "show")
    assert fields(shown)["jira_api_token"]["value"] is None and fields(shown)["jira_api_token"]["is_set"]
    assert "token-pela-cli" not in json.dumps(shown)
    shown = run_cli(monkeypatch, settings, sessions, "config", "unset", "history_days")
    assert fields(shown)["history_days"]["source"] == "default"
    shown = run_cli(monkeypatch, settings, sessions, "config", "import-env")
    assert "jira_base_url" in shown["imported"]
    with pytest.raises(SystemExit) as exit_info:
        run_cli(monkeypatch, settings, sessions, "config", "set", "checkpoint_hour", "30")
    assert exit_info.value.code == 1


def test_update_refuses_before_writing_anything(settings, sessions):
    save(settings, sessions, history_days=30)
    with pytest.raises(Invalid) as refused, session_scope(sessions) as session:
        config_store.update(settings, session, {"history_days": 40, "smtp_port": 0})
    assert refused.value.field == "smtp_port"
    assert raw_row(sessions) == {"history_days": 30}
