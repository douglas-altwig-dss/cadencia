"""The deck engine's messages and the report service in the reader's language (T4).

The deck itself is never translated (docs/i18n.md): these tests pin both halves — what a person
reads about a deck follows ``Accept-Language``, what the deck *says* does not.
"""

from __future__ import annotations

import asyncio
import zipfile

import pytest
from fastapi.testclient import TestClient

from cadencia.api.app import create_app
from cadencia.api.deps import clock
from cadencia.i18n import Msg, localize, render, using_locale
from cadencia.report.core.context import FIELDS, GROUP_IDS, catalog, fixed_text_spec
from cadencia.report.core.package_check import check_package
from cadencia.report.core.sample_template import build_sample_template
from cadencia.report.service import localized_catalog, localized_validation, stored_validation
from cadencia.store import schema as s
from cadencia.store.db import session_scope
from tests.support import NOW, PT_BR, collect_demo

DE = {"Accept-Language": "de-DE"}
EN = {"Accept-Language": "en-US"}


def ok(response):
    assert response.status_code < 300, response.text
    return response.json()


@pytest.fixture
def client(demo, sessions, settings):
    asyncio.run(collect_demo(demo, sessions, settings))
    app = create_app(settings, sessions)
    app.dependency_overrides[clock] = lambda: NOW
    with TestClient(app, headers=PT_BR) as test_client:
        yield test_client


@pytest.fixture
def uploaded(client, tmp_path):
    path = build_sample_template(tmp_path / "modelo.pptx")
    template = ok(client.post("/api/reports/templates", files={"file": ("modelo.pptx", path.read_bytes())}))
    detail = ok(client.get(f"/api/reports/templates/{template['id']}"))
    mapping = detail["suggestion"]
    mapping.pop("notes", None)
    return {"id": template["id"], "manifest": detail["manifest"], "mapping": mapping}


def _with_dual_use_and_a_bad_field(uploaded) -> tuple[int, dict]:
    """Slide 2 bound to risk evidence and situation labels (text the deck prints and the UI
    translates) plus a field that does not exist, so the preview has warnings to translate."""
    slide = uploaded["manifest"]["slides"][1]
    mapping = uploaded["mapping"]
    spec = mapping["slides"][str(slide["slide_id"])]
    spec["scope"] = "repeat"
    targets = [t["id"] for a in slide["areas"] if a.get("paragraphs") for t in a["targets"]]
    spec["bindings"] += [
        {"target": targets[0], "mode": "text", "field": "riscos.por_epico"},
        {"target": targets[0], "mode": "text", "field": "riscos.por_situacao"},
        {"target": targets[0], "mode": "text", "field": "campo.que_nao_existe"},
    ]
    return slide["slide_id"], mapping


def test_the_editor_preview_says_the_same_thing_in_every_language_but_warns_in_the_readers(client, uploaded):
    """2.8: the items are deck content (pt-BR whatever the header); the warnings are the reader's."""
    slide_id, mapping = _with_dual_use_and_a_bad_field(uploaded)
    url = f"/api/reports/templates/{uploaded['id']}/slides/{slide_id}/preview"
    body = {"mapping": mapping, "board_id": 1}
    views = {
        name: ok(client.post(url, json=body, headers=headers))
        for name, headers in (("pt", PT_BR), ("de", DE), ("en", EN))
    }
    assert views["pt"]["items"] == views["de"]["items"] == views["en"]["items"]
    assert views["pt"]["markers"] == views["de"]["markers"]
    texts = "\n".join(i.get("text") or "" for i in views["pt"]["items"])
    assert "aguardando CAD-11" in texts and "Bloqueado:" in texts  # risk evidence and labels, pt-BR
    assert views["pt"]["warnings"] != views["de"]["warnings"]
    assert "O campo campo.que_nao_existe não existe no catálogo." in views["pt"]["warnings"]
    assert "Das Feld campo.que_nao_existe gibt es im Katalog nicht." in views["de"]["warnings"]
    assert "The field campo.que_nao_existe does not exist in the catalog." in views["en"]["warnings"]


def test_a_runs_validation_is_stored_once_and_read_in_each_language(client, uploaded, sessions):
    _slide_id, mapping = _with_dual_use_and_a_bad_field(uploaded)
    ok(client.put(f"/api/reports/templates/{uploaded['id']}/mapping", json=mapping))
    run = ok(
        client.post(
            "/api/reports/generate", json={"template_id": uploaded["id"], "render": False}, headers=DE
        )
    )
    assert run["status"] == "invalid"
    unknown = [e for e in run["validation"]["errors"] if e.get("field") == "campo.que_nao_existe"]
    assert unknown and all("msg" not in e for e in run["validation"]["errors"])
    assert unknown[0]["message"].endswith("Das Feld campo.que_nao_existe gibt es im Katalog nicht.")
    findings = run["validation"]["accessibility"]["findings"]
    assert all(isinstance(f["message"], str) for f in findings)

    # Stored: the record plus its pt-BR text, so old readers and SQL still read a sentence.
    with session_scope(sessions) as session:
        stored = session.get(s.ReportRunRow, run["id"]).validation
    entry = next(e for e in stored["errors"] if e.get("field") == "campo.que_nao_existe")
    assert entry["msg"]["$msg"] == "deck_problem.unknown_field"
    assert entry["message"].endswith("o campo campo.que_nao_existe não existe no catálogo.")

    listed = ok(client.get("/api/reports/runs", params={"template_id": uploaded["id"]}, headers=EN))
    again = next(r for r in listed["items"] if r["id"] == run["id"])
    message = next(e for e in again["validation"]["errors"] if e.get("field") == "campo.que_nao_existe")
    assert message["message"].endswith("the field campo.que_nao_existe does not exist in the catalog.")

    refused = client.get(f"/api/reports/runs/{run['id']}/file", headers=DE)
    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert detail["cause"] == "Präsentation hat die Validierung nicht bestanden"
    assert any("Katalog" in e["message"] for e in detail["validation"]["errors"])


def test_the_field_catalogue_is_translated_for_the_picker_but_not_for_the_deck(client):
    def entry(headers):
        catalog_ = ok(client.get("/api/reports/variables", headers=headers))["catalog"]
        return next(e for e in catalog_ if e["key"] == "grafico.vazao")

    assert entry(EN)["label"] == "Throughput per sprint window"
    assert entry(DE)["label"] == "Durchsatz pro Sprintfenster"
    assert entry(PT_BR)["label"] == "Vazão por janela da sprint"
    assert {entry(h)["group_id"] for h in (EN, DE, PT_BR)} == {"charts"}
    assert entry(DE)["group"] == "Diagramme"
    # The deck-facing copy (chart alt text) is untouched.
    assert next(f for f in FIELDS if f.key == "grafico.vazao").label == "Vazão por janela da sprint"


def test_every_field_and_group_has_a_label_in_every_locale():
    for locale in ("en-US", "pt-BR", "de-DE"):
        with using_locale(locale):
            entries = localized_catalog(catalog())
        assert all(e["label"] and e["group_id"] for e in entries)
        for group_id in GROUP_IDS.values():
            assert render(Msg(f"fields.group.{group_id}"), locale)
    with using_locale("pt-BR"):
        assert [e["label"] for e in localized_catalog(catalog())] == [f.label for f in FIELDS]


def test_a_variable_keeps_its_own_label_and_only_its_hint_is_translated():
    entries = catalog(
        [fixed_text_spec("aviso", "Aviso interno"), fixed_text_spec("x", "X", "rows", "riscos.itens")]
    )
    with using_locale("de-DE"):
        localized = localized_catalog(entries)
    aviso = next(e for e in localized if e["key"] == "texto.aviso")
    assert aviso["label"] == "Aviso interno" and aviso["group_id"] == "variables"
    assert aviso["hint"].startswith("Variable;")
    assert next(e for e in localized if e["key"] == "texto.x")["hint"] == "Variable, gelesen aus riscos.itens"


def test_a_validation_stored_before_the_records_keeps_its_text():
    legacy = {
        "ok": False,
        "errors": [
            {"kind": "area_ausente", "message": "A área s1/sh2 não existe na versão atual do modelo."}
        ],
        "warnings": [],
        "info": ["LibreOffice não instalado: conferência visual automática indisponível."],
        "preview": {"rendered": False},
    }
    with using_locale("de-DE"):
        assert localized_validation(legacy) == legacy


def test_a_stored_validation_round_trips_through_its_records():
    fresh = {
        "ok": True,
        "errors": [],
        "warnings": [{"kind": "modelo_alterado", "message": Msg("deck_problem.template_changed").to_json()}],
        "info": [Msg("deck_problem.libreoffice_missing").to_json()],
        "preview": {"rendered": False, "reason": Msg("deck_problem.libreoffice_missing").to_json()},
    }
    stored = stored_validation(fresh)
    assert stored["warnings"][0]["message"].startswith("O modelo mudou")
    assert stored["info"] == ["LibreOffice não instalado: conferência visual automática indisponível."]
    with using_locale("en-US"):
        read = localized_validation(stored)
    assert read["warnings"] == [
        {
            "kind": "modelo_alterado",
            "message": "The template changed since the mapping was saved; check the areas.",
        }
    ]
    assert read["info"] == ["LibreOffice is not installed: automatic visual check unavailable."]
    assert read["preview"] == {"rendered": False, "reason": read["info"][0]}


def test_package_check_messages_render_in_the_ambient_language(tmp_path):
    broken = tmp_path / "quebrado.pptx"
    with zipfile.ZipFile(broken, "w") as z:
        z.writestr("ppt/slides/slide1.xml", "<x/>")
    report = check_package(broken)
    assert not report.ok
    with using_locale("de-DE"):
        messages = [e["message"] for e in localize(report.as_dict())["errors"]]
    assert "Das Paket hat keine [Content_Types].xml." in messages
    with using_locale("pt-BR"):
        messages = [e["message"] for e in localize(report.as_dict())["errors"]]
    assert "O pacote não tem [Content_Types].xml." in messages


@pytest.mark.parametrize(
    ("locale", "one", "many"),
    [
        ("en-US", "1 image or chart without alt text.", "3 images or charts without alt text."),
        (
            "de-DE",
            "1 Bild oder Diagramm ohne Alternativtext.",
            "3 Bilder oder Diagramme ohne Alternativtext.",
        ),
        (
            "pt-BR",
            "1 imagem(ns) ou gráfico(s) sem texto alternativo.",
            "3 imagem(ns) ou gráfico(s) sem texto alternativo.",
        ),
    ],
)
def test_the_accessibility_summary_counts_in_words(locale, one, many):
    key = "deck_service.a11y_summary.sem_texto_alternativo"
    assert render(Msg(key, n=1), locale) == one
    assert render(Msg(key, n=3), locale) == many


@pytest.mark.parametrize("kind", ["sem_texto_alternativo", "contraste_baixo", "ordem_de_leitura"])
def test_every_accessibility_kind_has_a_summary(kind):
    assert render(Msg(f"deck_service.a11y_summary.{kind}", n=2), "de-DE")
