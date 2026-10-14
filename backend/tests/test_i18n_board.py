"""Board views, risk, snapshots and changes in every language (docs/i18n-backend.md, T2).

pt-BR is pinned by the rest of the suite (R8: the same words as before); here the same API answers
in en-US and de-DE, stored snapshots carry messages plus their pt-BR mirror, and a snapshot stored
before messages existed keeps its own text in every language.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from cadencia.analytics import changes as changes_view
from cadencia.analytics.health import board_health
from cadencia.analytics.serialize import evidence_dict, evidence_record
from cadencia.api.app import create_app
from cadencia.api.deps import clock
from cadencia.domain.calendar import sprint_timeline
from cadencia.domain.models import BoardProfile, Sprint
from cadencia.domain.risk import RULES, SEVERITY, Evidence, Situation
from cadencia.errors import Invalid
from cadencia.i18n import SUPPORTED, Msg, catalog, render, using_locale
from cadencia.store import schema as s
from cadencia.store.db import session_scope
from tests.support import NOW, PT_BR, collect_demo

EN = {"Accept-Language": "en-US"}
DE = {"Accept-Language": "de-DE"}
HEALTH_CHECKS = (
    "campos_ausentes",
    "coleta_desatualizada",
    "sem_estimativa",
    "status_sem_coluna",
    "sprint_sem_datas",
    "em_andamento_sem_responsavel",
    "fora_do_time",
    "historico_curto",
)


@pytest.fixture
def client(demo, sessions, settings):
    asyncio.run(collect_demo(demo, sessions, settings))
    app = create_app(settings, sessions)
    app.dependency_overrides[clock] = lambda: NOW
    with TestClient(app, headers=PT_BR) as test_client:
        yield test_client


def ok(response):
    assert response.status_code < 300, response.text
    return response.json()


def risks(client, headers):
    return {r["key"]: r["risk"] for r in ok(client.get("/api/sprints/12/risks", headers=headers))["items"]}


# ----------------------------------------------------------------------------- dynamic keys


def test_every_dynamic_key_exists_in_every_locale():
    """The keys built from codes: one per situation, rule and health check."""
    keys = [f"risk.situation.{s.value}" for s in SEVERITY]
    keys += [f"risk.rule.{rule}" for rule in RULES]
    keys += [f"health.{check}.{part}" for check in HEALTH_CHECKS for part in ("title", "action")]
    for locale in SUPPORTED:
        missing = [key for key in keys if key not in catalog(locale)]
        assert not missing, f"{locale}: {missing}"


# ----------------------------------------------------------------------------- risk


def test_risks_speak_the_request_language(client):
    pt, en, de = risks(client, PT_BR), risks(client, EN), risks(client, DE)
    assert (pt["CAD-14"]["label"], en["CAD-14"]["label"], de["CAD-14"]["label"]) == (
        "Atrasado",
        "Overdue",
        "Überfällig",
    )
    assert en["CAD-14"]["evidence"][0]["message"] == "due date 09/06 passed 4 days ago"
    assert de["CAD-14"]["evidence"][0]["message"] == "Fälligkeitsdatum 06.09. seit 4 Tagen überschritten"
    assert pt["CAD-14"]["evidence"][0]["message"] == "data limite 06/09 vencida há 4 dias"
    blocked = en["CAD-18"]["evidence"][0]
    assert blocked["code"] == "risk.evidence.blocked" and "waiting for CAD-11" in blocked["message"]
    assert blocked["rule_description"].startswith("Flagged as an impediment")
    assert "wartet auf CAD-11" in de["CAD-18"]["evidence"][0]["message"]
    stalled = next(e for e in en["CAD-11"]["evidence"] if e["rule"] == "estagnacao")
    assert any("from Bruno Lima to Carla Mendes" in d for d in stalled["details"])
    assert stalled["label"] == "Stalled" and stalled["message"].startswith("stalled for ")
    # Codes never change with the language.
    assert [e["rule"] for e in en["CAD-11"]["evidence"]] == [e["rule"] for e in pt["CAD-11"]["evidence"]]


def test_the_two_evidence_serialisers():
    evidence = Evidence(
        "prazo",
        Situation.OVERDUE,
        Msg("risk.evidence.overdue", due="2026-09-07", late=3),
        days=3.0,
        details=(Msg("risk.detail.sprint", after="S2", when="2026-09-01"),),
    )
    with using_locale("de-DE"):
        record = evidence_record(evidence)
        wire = evidence_dict(evidence)
    # Storage: the message as a record plus the pt-BR mirror, whatever the ambient locale.
    assert record["msg"] == {"$msg": "risk.evidence.overdue", "params": {"due": "2026-09-07", "late": 3}}
    assert record["message"] == "data limite 07/09 vencida há 3 dias"
    assert record["details"] == ["sprint mudou para S2 em 01/09"]
    assert record["detail_msgs"][0]["$msg"] == "risk.detail.sprint"
    assert "label" not in record and "rule_description" not in record
    # The wire: rendered in the ambient locale, with the key as `code`.
    assert wire["message"] == "Fälligkeitsdatum 07.09. seit 3 Tagen überschritten"
    assert wire["label"] == "Überfällig" and wire["code"] == "risk.evidence.overdue"
    assert wire["details"] == ["Sprint wechselte am 01.09. zu S2"]


# ----------------------------------------------------------------------------- snapshots and changes


def test_stored_snapshots_carry_messages_and_their_pt_br_mirror(client, sessions):
    with session_scope(sessions) as session:
        rows = [r for r in session.scalars(select(s.SnapshotRow)) if r.evidence]
        assert rows
        for row in rows:
            for entry in row.evidence:
                assert Msg.is_json(entry["msg"])
                assert entry["message"] == render(Msg.from_json(entry["msg"]), "pt-BR")


def test_changes_speak_the_request_language(client):
    def cad14(headers):
        changes = ok(client.get("/api/boards/1/changes", headers=headers))
        return next(e for e in changes["new_risks"] if e["key"] == "CAD-14")

    pt, en, de = cad14(PT_BR), cad14(EN), cad14(DE)
    assert (pt["label"], en["label"], de["label"]) == ("Atrasado", "Overdue", "Überfällig")
    assert pt["reason"] == "data limite 06/09 vencida há 4 dias"
    assert en["reason"] == "due date 09/06 passed 4 days ago"
    assert de["reason"] == "Fälligkeitsdatum 06.09. seit 4 Tagen überschritten"
    order = client.get("/api/boards/1/changes", params={"since": 99999}, headers=EN).json()
    assert order["detail"]["message"] == "Checkpoint 99999 does not exist on this board or has no snapshot."


def test_a_snapshot_stored_before_messages_keeps_its_text(client, sessions):
    """Decision 7: no backfill. A row with only the pt-BR `message` shows it in every language."""
    with session_scope(sessions) as session:
        checkpoint = max(
            (c for c in session.scalars(select(s.CheckpointRow)) if c.board_id == 1 and c.at <= NOW),
            key=lambda c: c.at,
        )
        legacy = {"rule": "prazo", "situation": "atrasado", "message": "texto antigo guardado", "details": []}
        for row in session.scalars(select(s.SnapshotRow).where(s.SnapshotRow.checkpoint_id == checkpoint.id)):
            row.evidence = [legacy] if row.evidence else []
        session.flush()
        for locale in SUPPORTED:
            with using_locale(locale):
                state = changes_view.state_at_checkpoint(session, checkpoint.id)
            with_reason = [e for e in state.values() if e["reason"] is not None]
            assert with_reason and all(e["reason"] == "texto antigo guardado" for e in with_reason)


def test_the_digest_text_follows_the_ambient_locale():
    space = {
        "boards": [
            {"board": {"name": "Plataforma"}, "since": None, "new_risks": [], "resolved": []},
            {
                "board": {"name": "Dados"},
                "since": {"at": "2026-09-03T18:00:00+00:00"},
                "new_risks": [{"key": "D-1", "label": "Overdue", "summary": "Load", "reason": "late"}],
                "resolved": [],
            },
        ]
    }
    with using_locale("en-US"):
        text = changes_view.digest_text(space, lambda at: "09/03 15:00")
    assert text.splitlines() == [
        "Plataforma: nothing new since the start.",
        "Dados: 1 new risk, 0 resolved since 09/03 15:00.",
        "  • D-1 Overdue: Load — late",
    ]
    with using_locale("pt-BR"):
        text = changes_view.digest_text(space, lambda at: "03/09 15:00")
    assert text.splitlines()[:2] == [
        "Plataforma: nada novo desde o início.",
        "Dados: 1 novo(s) risco(s), 0 resolvido(s) desde 03/09 15:00.",
    ]


# ----------------------------------------------------------------------------- health, warnings, profile


def test_health_checks_speak_the_request_language(client):
    def checks(headers):
        report = ok(client.get("/api/health-check", params={"board_id": "1"}, headers=headers))
        return {c["id"]: c for c in report["items"][0]["checks"]}

    pt, en, de = checks(PT_BR), checks(EN), checks(DE)
    assert pt.keys() == en.keys() == de.keys() and pt
    for check_id in pt:
        assert pt[check_id]["title"] == render(Msg(f"health.{check_id}.title"), "pt-BR")
        assert en[check_id]["title"] == render(Msg(f"health.{check_id}.title"), "en-US")
        assert de[check_id]["action"] == render(Msg(f"health.{check_id}.action"), "de-DE")
        assert en[check_id]["title"] != pt[check_id]["title"]


def test_the_deck_appendix_of_health_stays_pt_br(demo, sessions, settings):
    """The deck's `saude.*` rows are built under the deck locale; the strings are the old ones."""
    asyncio.run(collect_demo(demo, sessions, settings))
    from cadencia.analytics.data import load_board
    from cadencia.store import repo

    with session_scope(sessions) as session, using_locale("pt-BR"):
        data = load_board(session, 1, repo.profile_defaults(settings), settings.history_days)
        report = board_health(data, repo.load_field_map(session), NOW)
    titles = {c["id"]: c["title"] for c in report["checks"]}
    if "historico_curto" in titles:
        assert titles["historico_curto"] == "Pouco histórico concluído"


def test_sprint_warnings_are_rendered_where_they_are_shown():
    profile = BoardProfile(board_id=1)
    sprint = Sprint(1, 1, "S", "active", datetime(2026, 9, 1, 12, tzinfo=UTC), None)
    timeline = sprint_timeline(sprint, profile)
    assert all(isinstance(w, Msg) for w in timeline.warnings)
    by_locale = {loc: [render(w, loc) for w in timeline.warnings] for loc in SUPPORTED}
    assert by_locale["pt-BR"][0].startswith("Sprint sem data de fim no Jira: assumida a duração configurada")
    assert by_locale["en-US"][0].startswith("The sprint has no end date in Jira")
    assert by_locale["de-DE"][0].startswith("Sprint ohne Enddatum in Jira")


def test_sprint_warnings_reach_the_api_translated(client):
    for headers, word in ((EN, "sprint"), (DE, "Sprint")):
        boards = ok(client.get("/api/boards/1/sprints", headers=headers))
        for item in boards["sprints"]:
            for warning in item["warnings"]:
                assert isinstance(warning, str) and word.lower() in warning.lower()


def test_profile_validation_speaks_the_ambient_language():
    with pytest.raises(Invalid) as info:
        BoardProfile.check({"timezone": "Mars/Base", "hours_per_day": 99})
    with using_locale("en-US"):
        assert (
            str(info.value)
            == "timezone: unknown time zone: 'Mars/Base'; hours_per_day: must be between 0.5 and 24"
        )
    with using_locale("pt-BR"):
        assert str(info.value) == (
            "timezone: fuso horário desconhecido: 'Mars/Base'; hours_per_day: precisa estar entre 0.5 e 24"
        )
    with using_locale("de-DE"):
        assert "unbekannte Zeitzone" in str(info.value)


def test_board_route_errors_speak_the_request_language(client):
    response = client.get("/api/export/nope", headers=DE)
    assert response.status_code == 404 and response.json()["detail"]["cause"] == "unbekannter Datensatz"
    response = client.get("/api/people/ghost/availability", headers=EN)
    assert response.status_code == 404 and response.json()["detail"]["message"] == "Person not found."
    response = client.get("/api/epics/NOPE-1/forecast", params={"board_id": 1}, headers=EN)
    if response.status_code == 404 and "Epic" in response.text:
        assert response.json()["detail"]["message"] == "Epic NOPE-1 is not on this board."
