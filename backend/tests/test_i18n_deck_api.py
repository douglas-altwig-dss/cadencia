"""T6: the deck routes, the shared dependencies, the library, the narrative, the focus log and the
CLI speak the request's language (or CADENCIA_LOCALE), and pt-BR stays word for word."""

from __future__ import annotations

import asyncio
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from cadencia.api.app import create_app
from cadencia.api.deps import clock
from cadencia.focus_log.model import Documento
from cadencia.i18n import tr, using_locale
from cadencia.report.core.sample_template import build_sample_template
from cadencia.report.narrative import NarrativeUnavailable, draft_narrative
from tests.support import NOW, collect_demo

EN = {"Accept-Language": "en-US"}
DE = {"Accept-Language": "de-DE"}
PT = {"Accept-Language": "pt-BR"}


@pytest.fixture
def client(demo, sessions, settings):
    asyncio.run(collect_demo(demo, sessions, settings))
    app = create_app(settings, sessions)
    app.dependency_overrides[clock] = lambda: NOW
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def template_id(client, tmp_path):
    path = build_sample_template(tmp_path / "modelo.pptx")
    response = client.post(
        "/api/reports/templates", files={"file": ("modelo.pptx", path.read_bytes())}, headers=PT
    )
    assert response.status_code < 300, response.text
    return response.json()["id"]


@pytest.mark.parametrize(
    ("headers", "cause", "message"),
    [
        (EN, "board not found", "Board 999 does not exist or has not been discovered yet."),
        (DE, "Board nicht gefunden", "Das Board 999 existiert nicht oder wurde noch nicht erkannt."),
        (PT, "board não encontrado", "O board 999 não existe ou ainda não foi descoberto."),
    ],
)
def test_404_from_the_shared_dependencies(client, headers, cause, message):
    response = client.get("/api/boards/999/overview", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == {"cause": cause, "message": message}


@pytest.mark.parametrize(
    ("headers", "cause"),
    [(EN, "generation not found"), (DE, "Erstellung nicht gefunden"), (PT, "geração não encontrada")],
)
def test_404_from_the_deck_routes(client, headers, cause):
    response = client.get("/api/reports/runs/nope/file", headers=headers)
    assert response.status_code == 404 and response.json()["detail"]["cause"] == cause


def test_400_and_409_bodies_follow_the_header(client, template_id):
    bad = client.post("/api/reports/templates", files={"file": ("x.txt", b"x")}, headers=DE)
    assert bad.status_code == 400
    assert bad.json()["detail"] == {"cause": "ungültiges Format", "message": "Senden Sie eine .pptx-Datei."}

    stale = client.put(
        f"/api/reports/templates/{template_id}/edits",
        json={"edits": {}, "base_revision": 99},
        headers=EN,
    )
    assert stale.status_code == 409
    detail = stale.json()["detail"]
    assert detail["cause"] == "the edits changed while you were editing"
    assert detail["action"].startswith("Reload the editor")


@pytest.mark.parametrize(
    ("headers", "cause", "message"),
    [
        (EN, "AI suggestion unavailable", "AI suggestions are turned off (CADENCIA_AI_ENABLED)."),
        (DE, "KI-Vorschlag nicht verfügbar", "KI-Vorschläge sind ausgeschaltet (CADENCIA_AI_ENABLED)."),
    ],
)
def test_503_from_the_narrative_follows_the_header(client, template_id, headers, cause, message):
    response = client.post(
        f"/api/reports/templates/{template_id}/narrative", json={"board_id": 1}, headers=headers
    )
    assert response.status_code == 503
    assert response.json()["detail"]["cause"] == cause
    assert response.json()["detail"]["message"] == message


def test_library_diagnostics_and_usage_texts_per_locale():
    with using_locale("en-US"):
        assert tr("library.diagnostics.fonts", count=1).startswith("1 font without")
        assert tr("library.diagnostics.orphan_markers", count=2) == (
            "2 {…} markers that no field or variable answers."
        )
    with using_locale("de-DE"):
        assert tr("library.usage.often_empty", name="Resumo", count=3, runs=4) == (
            "„Resumo“ war in 3 von 4 Erstellungen leer: entfernen?"
        )
    assert tr("library.diagnostics.unnamed_slides", count=2) == "2 slide(s) sem nome nem título."


@pytest.mark.locale("de-DE")
def test_the_narrative_error_renders_in_the_ambient_locale(settings):
    with pytest.raises(NarrativeUnavailable) as caught:
        draft_narrative(settings.model_copy(update={"ai_enabled": False}), {})
    assert str(caught.value) == "KI-Vorschläge sind ausgeschaltet (CADENCIA_AI_ENABLED)."


@pytest.mark.locale("en-US")
def test_focus_log_validation_speaks_the_ambient_locale():
    with pytest.raises(ValueError, match="Duplicate theme: x"):
        Documento.model_validate(
            {"temas": [{"nome": "x", "cor": "#000000"}, {"nome": "X", "cor": "#000000"}]}
        )


def test_focus_log_conflict_follows_the_header(client):
    response = client.put("/api/focus-log", json={"base_revision": 42}, headers=DE)
    assert response.status_code == 409
    assert response.json()["detail"]["cause"].startswith("die Zeitleiste hat sich geändert")


@pytest.mark.parametrize(
    ("locale", "text"),
    [("en-US", "applies the database migrations"), ("de-DE", "wendet die Datenbankmigrationen an")],
)
def test_cli_help_speaks_cadencia_locale(tmp_path, locale, text):
    env = {
        "CADENCIA_LOCALE": locale,
        "CADENCIA_DATABASE_URL": f"sqlite:///{tmp_path / 'cli.db'}",
        "CADENCIA_DATA_DIR": str(tmp_path),
        "PATH": "/usr/bin:/bin",
    }
    out = subprocess.run(
        [sys.executable, "-m", "cadencia.cli", "--help"], capture_output=True, text=True, env=env, check=True
    )
    assert text in out.stdout
