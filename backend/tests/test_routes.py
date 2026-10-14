"""docs/routes.md: English API paths, 308s from the old ones, English web-app links, migration 0023."""

from __future__ import annotations

import importlib.util
import re
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from cadencia import notify
from cadencia.analytics.week import search
from cadencia.api.app import create_app
from cadencia.api.legacy import LEGACY_API_PATHS, english_api_path
from cadencia.store import schema as s
from cadencia.store.db import make_engine, session_scope, upgrade
from tests.support import PT_BR, make_settings

BACKEND = Path(__file__).resolve().parent.parent
MIGRATION = BACKEND / "cadencia" / "store" / "migrations" / "versions" / "0023_english_routes.py"


@pytest.fixture
def client(sessions, settings):
    with TestClient(create_app(settings, sessions), headers=PT_BR) as test_client:
        yield test_client


# ------------------------------------------------------------------ API paths


def test_every_old_api_path_points_at_a_route_that_exists(client):
    def shape(path: str) -> str:
        return re.sub(r"\{\w+\}", "{x}", path)

    routes = {shape(p) for p in client.get("/openapi.json").json()["paths"]}
    for old, new in LEGACY_API_PATHS:
        assert shape(new) in routes, new
        assert shape(old) not in routes, old


@pytest.mark.parametrize(
    ("old", "new"),
    [
        ("/api/papeis", "/api/roles"),
        ("/api/papeis/7", "/api/roles/7"),
        ("/api/membros/demo-ana", "/api/members/demo-ana"),
        ("/api/planejamento", "/api/planning"),
        ("/api/planejamento/parametros", "/api/planning/parameters"),
        ("/api/planejamento/algoritmos", "/api/planning/algorithms"),
        ("/api/epics/ANL-1/plano", "/api/epics/ANL-1/plan"),
        ("/api/epics/ANL-1/plano/selecao", "/api/epics/ANL-1/plan/selection"),
        ("/api/subtarefas/ANL-3/papeis", "/api/subtasks/ANL-3/roles"),
        ("/api/reports/templates/4/clonar-mapeamento", "/api/reports/templates/4/clone-mapping"),
        ("/api/reports/palette/acessivel", "/api/reports/palette/accessible"),
        ("/api/reports/runs/abc/reassociar", "/api/reports/runs/abc/reassociate"),
    ],
)
def test_old_api_paths_map_to_their_english_names(old, new):
    assert english_api_path(old) == new


@pytest.mark.parametrize(
    "path", ["/api/roles", "/api/epics/ANL-1/plan", "/api/public/decks/papeis", "/api/papeis/1/x", "/papeis"]
)
def test_new_and_unrelated_paths_are_left_alone(path):
    assert english_api_path(path) is None


def test_an_old_get_answers_308_and_keeps_the_query_string(client):
    moved = client.get("/api/planejamento/algoritmos?lang=en-US&x=1", follow_redirects=False)
    assert moved.status_code == 308
    assert moved.headers["location"] == "/api/planning/algorithms?lang=en-US&x=1"
    assert client.get("/api/planejamento/algoritmos").json()["items"]  # followed, it answers


def test_an_old_post_is_redirected_with_its_method_and_body(client):
    body = {"nome": "QA", "descricao": "Testa.", "cor": "#123abc", "rotulos": ["qa"]}
    moved = client.post("/api/papeis", json=body, follow_redirects=False)
    assert moved.status_code == 308 and moved.headers["location"] == "/api/roles"
    created = client.post("/api/papeis", json=body)  # httpx re-sends method and body on a 308
    assert created.status_code == 201, created.text
    assert created.json()["nome"] == "QA"
    assert "QA" in [r["nome"] for r in client.get("/api/roles").json()["items"]]


def test_a_caller_without_the_token_is_refused_before_any_redirect(tmp_path, sessions):
    app = create_app(make_settings(tmp_path, api_token="s3cret"), sessions)
    with TestClient(app) as client:
        refused = client.get("/api/papeis", follow_redirects=False)
        assert refused.status_code == 401 and "location" not in refused.headers
        signed = client.get("/api/papeis", headers={"Authorization": "Bearer s3cret"}, follow_redirects=False)
        assert signed.status_code == 308 and signed.headers["location"] == "/api/roles"


def test_openapi_tags_are_english(client):
    tags = {
        t
        for op in client.get("/openapi.json").json()["paths"].values()
        for v in op.values()
        for t in v["tags"]
    }
    assert tags and all(t.isascii() for t in tags), tags
    assert not tags & {"apresentação", "configuração", "pessoas", "planejamento", "plano do épico", "visões"}


# ------------------------------------------------------------------ web-app links

OLD_WEB_PATH = re.compile(
    r"/(configuracao|pessoas|apresentacao|apresentar|fluxo|inicio|timeline-foco|compartilhado|minha-semana)(?!-)"
    r"|[?&](modelo|forma|assistente|ausencias|funcoes|perfil|canal)="
)


def test_no_backend_module_builds_an_old_web_app_link():
    skip = {MIGRATION, BACKEND / "cadencia" / "api" / "legacy.py"}
    offenders = [
        f"{path.relative_to(BACKEND)}:{n}"
        for path in (BACKEND / "cadencia").rglob("*.py")
        if path not in skip
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if OLD_WEB_PATH.search(line)
    ]
    assert offenders == []


def test_search_links_people_and_templates_to_the_english_screens(sessions):
    with session_scope(sessions) as session:
        session.add(s.PersonRow(account_id="acc-1", display_name="Modelo Pessoa"))
        session.add(
            s.TemplateRow(
                name="Modelo trimestral",
                filename="m.pptx",
                sha256="0" * 64,
                path="m.pptx",
                uploaded_at=datetime(2026, 9, 1, tzinfo=UTC),
            )
        )
        session.flush()
        paths = {i["type"]: i["path"] for i in search(session, "modelo", 10)}
        template_id = session.query(s.TemplateRow.id).scalar()
    assert paths["pessoa"] == "/people/acc-1"
    assert paths["modelo"] == f"/presentation/templates/{template_id}"


def test_the_deck_notification_links_the_presentation_screen(tmp_path):
    settings = make_settings(tmp_path, public_url="https://cadencia.example/")
    run = SimpleNamespace(
        status="ok", validation={}, template_id=3, id="r1", reference_at=datetime(2026, 9, 10, tzinfo=UTC)
    )
    message = notify.deck_message(settings, run, "Sprint")
    assert message.link == "https://cadencia.example/presentation/runs/r1"


# ------------------------------------------------------------------ migration 0023


def _migration():
    spec = importlib.util.spec_from_file_location("migration_0023", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    ("old", "new"),
    [
        (
            ("/fluxo", "person=ana&tab=riscos"),
            ("/flow", "person=ana&tab=riscos"),
        ),  # tab values: the web app's
        (("/pessoas/demo-ana", ""), ("/people/demo-ana", "")),
        (("/pessoas", "ausencias=1"), ("/people", "absences=1")),
        (("/apresentacao", "modelo=3&run=r1&forma=sh4"), ("/presentation", "template=3&run=r1&shape=sh4")),
        (("/configuracao/assistente", ""), ("/settings/wizard", "")),
        (("/configuracao", "tab=campos"), ("/settings", "tab=campos")),
        (("/apresentar/plateia", ""), ("/present/audience", "")),
        (("/timeline-foco", ""), ("/focus-timeline", "")),
        (("/minha-semana", ""), ("/my-week", "")),
        (("/inicio", ""), ("/getting-started", "")),
        (("/compartilhado/abc", ""), ("/shared/abc", "")),
        (("/apresentacao?modelo=2", ""), ("/presentation?template=2", "")),
        (("/pessoas", "funcoes=1"), ("/people", "roles=1")),
        (("/configuracao", "tab=perfil&perfil=4"), ("/settings", "tab=perfil&profile=4")),
        (("/apresentar/plateia", "canal=abc"), ("/present/audience", "channel=abc")),
        (("/fluxograma", "modelos=1"), ("/fluxograma", "modelos=1")),  # whole segments and keys only
        (("/boards/1", "board=1&person=x"), ("/boards/1", "board=1&person=x")),
    ],
)
def test_the_migration_rewrites_paths_and_query_keys_both_ways(old, new):
    rewrite = _migration().rewrite
    assert rewrite(*old) == new
    if old[0] != "/fluxograma":
        assert rewrite(*new, reverse=True) == old


def test_when_both_spellings_are_stored_the_english_key_wins():
    assert _migration().rewrite("/apresentacao", "modelo=1&template=2&run=r") == (
        "/presentation",
        "template=2&run=r",
    )


def test_migration_0023_rewrites_stored_views_and_downgrades(tmp_path):
    from alembic import command
    from alembic.config import Config

    from cadencia.store.db import MIGRATIONS_DIR

    url = f"sqlite:///{tmp_path / 'cadencia.db'}"
    upgrade(url)
    engine = make_engine(url)
    with engine.begin() as connection:
        connection.execute(text("UPDATE alembic_version SET version_num = '0022'"))
        connection.execute(
            text(
                "INSERT INTO saved_view (name, path, query, pinned, created_at) VALUES "
                "('a', '/fluxo', 'person=ana', 1, '2026-09-01 00:00:00'),"
                "('b', '/apresentacao', 'modelo=3', 0, '2026-09-01 00:00:00'),"
                "('c', '/boards/1', 'tab=riscos', 0, '2026-09-01 00:00:00')"
            )
        )
    upgrade(url)

    def rows():
        with engine.connect() as connection:
            return connection.execute(text("SELECT name, path, query FROM saved_view ORDER BY name")).all()

    assert rows() == [
        ("a", "/flow", "person=ana"),
        ("b", "/presentation", "template=3"),
        ("c", "/boards/1", "tab=riscos"),
    ]

    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", url)
    command.downgrade(config, "0022")
    assert rows() == [
        ("a", "/fluxo", "person=ana"),
        ("b", "/apresentacao", "modelo=3"),
        ("c", "/boards/1", "tab=riscos"),
    ]
    command.upgrade(config, "head")
    assert rows()[1] == ("b", "/presentation", "template=3")
