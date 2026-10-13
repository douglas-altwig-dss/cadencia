"""The "Timeline de foco" log: its rules, its revisions, and its isolation from Jira.

The client here has no collected boards at all. That is the point: the log must work, and be tested,
without anything from Jira in the database.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cadencia.api.app import create_app
from cadencia.api.deps import clock
from cadencia.focus_log.model import Documento, normaliza
from tests.support import NOW, PT_BR

PACKAGE = Path(__file__).resolve().parents[1] / "cadencia" / "focus_log"

#: What the log may not reach for. The log is a standalone notebook; Jira, the analytics, the
#: collector, the domain and the deck are all out of bounds.
FORBIDDEN = (
    "cadencia.jira",
    "cadencia.analytics",
    "cadencia.collector",
    "cadencia.domain",
    "cadencia.report",
    "cadencia.api",
    "cadencia.demo",
    "cadencia.notify",
    "cadencia.config",
)


@pytest.fixture
def client(sessions, settings):
    app = create_app(settings, sessions)
    app.dependency_overrides[clock] = lambda: NOW
    with TestClient(app, headers=PT_BR) as test_client:
        yield test_client


def documento(**over) -> dict:
    base = {
        "pessoas": [{"id": "p1", "nome": "Ana", "cargo": "Engenheira", "cor": "#0B7A75"}],
        "temas": [{"nome": "CI/CD", "cor": "#2563EB", "palavras": "ci/cd, pipeline"}],
        "registros": [
            {
                "uid": "r1",
                "tipo": "tarefa",
                "nome": "Ana",
                "data": "2026-10-01",
                "registro": "Ajustei o pipeline.",
            },
            {
                "uid": "r2",
                "tipo": "troca",
                "nome": "Ana",
                "data": "2026-10-02",
                "registro": "Priorizou a entrega.",
                "de_tema": "CI/CD",
                "para_tema": "CI/CD",
                "icone": "🎯",
                "cor_destaque": "#6366F1",
                "estilo_linha": "borda-tracejada",
            },
        ],
    }
    base.update(over)
    return base


def ok(response):
    assert response.status_code < 300, response.text
    return response.json()


def test_an_empty_log_reads_as_revision_zero(client):
    assert ok(client.get("/api/focus-log")) == {
        "revision": 0,
        "pessoas": [],
        "temas": [],
        "registros": [],
        "sinais": [],
    }


def test_saves_the_whole_document_and_reads_it_back_in_order(client):
    saved = ok(client.put("/api/focus-log", json={**documento(), "base_revision": 0}))
    assert saved["saved"] is True and saved["revision"] == 1
    read = ok(client.get("/api/focus-log"))
    assert read["revision"] == 1
    assert [r["uid"] for r in read["registros"]] == ["r1", "r2"]
    assert read["pessoas"] == [{"id": "p1", "nome": "Ana", "cargo": "Engenheira", "cor": "#0B7A75"}]


def test_entries_keep_their_date_and_change_of_focus_fields(client):
    ok(client.put("/api/focus-log", json={**documento(), "base_revision": 0}))
    troca = next(r for r in ok(client.get("/api/focus-log"))["registros"] if r["uid"] == "r2")
    assert troca["data"] == "2026-10-02"
    assert troca["de_tema"] == "CI/CD" and troca["para_tema"] == "CI/CD"
    assert troca["estilo_linha"] == "borda-tracejada" and troca["cor_destaque"] == "#6366F1"
    tarefa = next(r for r in ok(client.get("/api/focus-log"))["registros"] if r["uid"] == "r1")
    assert tarefa["de_tema"] is None and tarefa["icone"] is None


def test_each_save_bumps_the_revision(client):
    first = ok(client.put("/api/focus-log", json={**documento(), "base_revision": 0}))
    second = ok(
        client.put("/api/focus-log", json={**documento(registros=[]), "base_revision": first["revision"]})
    )
    assert second["revision"] == 2
    assert second["registros"] == []


def test_a_save_from_a_stale_revision_is_refused_with_the_current_one(client):
    ok(client.put("/api/focus-log", json={**documento(), "base_revision": 0}))
    response = client.put("/api/focus-log", json={**documento(), "base_revision": 0})
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["revision"] == 1
    assert "Recarregue" in detail["action"]


def test_a_save_without_a_base_revision_overwrites(client):
    ok(client.put("/api/focus-log", json={**documento(), "base_revision": 0}))
    overwritten = ok(client.put("/api/focus-log", json=documento(registros=[])))
    assert overwritten["revision"] == 2 and overwritten["registros"] == []


@pytest.mark.parametrize(
    "over",
    [
        {
            "pessoas": [
                {"id": "p1", "nome": "Ana", "cor": "#0B7A75"},
                {"id": "p2", "nome": "ANA", "cor": "#B4463C"},
            ]
        },
        {"temas": [{"nome": "CI/CD", "cor": "#2563EB"}, {"nome": "ci/cd", "cor": "#000000"}]},
        {"pessoas": [{"id": "p1", "nome": "   ", "cor": "#0B7A75"}]},
        {"pessoas": [{"id": "p1", "nome": "Ana", "cor": "azul"}]},
        {
            "registros": [
                {"uid": "r1", "tipo": "troca", "nome": "Ana", "data": "2026-10-02", "registro": "Sem temas."}
            ]
        },
        {
            "registros": [
                {"uid": "r1", "tipo": "tarefa", "nome": "Ana", "data": "2026-10-02", "registro": "  "}
            ]
        },
        {"registros": [{"uid": "r1", "tipo": "outro", "nome": "Ana", "data": "2026-10-02", "registro": "x"}]},
        {
            "registros": [
                {"uid": "r1", "tipo": "tarefa", "nome": "Ana", "data": "31/02/2026", "registro": "x"}
            ]
        },
        {
            "registros": [
                {"uid": "r1", "tipo": "tarefa", "nome": "Ana", "data": "2026-10-02", "registro": "x"}
            ]
            * 2
        },
        {"campo_inventado": True},
    ],
)
def test_the_rules_refuse_what_the_log_cannot_hold(client, over):
    response = client.put("/api/focus-log", json={**documento(**over), "base_revision": 0})
    assert response.status_code == 422, response.text


def test_names_are_compared_without_accents_or_case():
    assert normaliza("Ana") == normaliza("ANA")
    assert normaliza("Mariâna") == "mariana"
    assert normaliza("Migração") == "migracao"


def test_the_document_model_checks_repeats_on_its_own():
    with pytest.raises(ValueError, match="repetido"):
        Documento.model_validate(
            {
                "pessoas": [
                    {"id": "a", "nome": "Ana", "cor": "#000000"},
                    {"id": "b", "nome": "ana", "cor": "#000000"},
                ]
            }
        )


SINAL = {
    "nome": "Impedimento",
    "cor": "#DC2626",
    "palavras": "impedimento, impedido",
    "gatilho": "o texto cita impedimento",
}


def test_signals_are_saved_and_read_back_as_the_team_defined_them(client):
    ok(client.put("/api/focus-log", json={**documento(sinais=[SINAL]), "base_revision": 0}))
    assert ok(client.get("/api/focus-log"))["sinais"] == [SINAL]


@pytest.mark.parametrize(
    "sinais",
    [
        [SINAL, {**SINAL, "nome": "impedimento"}],
        [{**SINAL, "cor": "vermelho"}],
        [{**SINAL, "nome": ""}],
    ],
)
def test_signals_obey_the_same_rules_as_themes(client, sinais):
    response = client.put("/api/focus-log", json={**documento(sinais=sinais), "base_revision": 0})
    assert response.status_code == 422, response.text


def test_the_log_works_with_no_collected_jira_data(client):
    """No board, sprint or issue exists here, and the log still saves and reads."""
    assert ok(client.put("/api/focus-log", json={**documento(), "base_revision": 0}))["revision"] == 1


def _imports(path: Path) -> list[str]:
    found: list[str] = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            found += [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            found.append(node.module)
    return found


def test_the_package_does_not_import_jira_or_the_analytics_layer():
    """Enforced, not documented: a convenience import of Jira data is exactly what this module must not grow."""
    offenders = [
        (path.name, module)
        for path in PACKAGE.glob("*.py")
        for module in _imports(path)
        if any(module == bad or module.startswith(bad + ".") for bad in FORBIDDEN)
    ]
    assert offenders == []
