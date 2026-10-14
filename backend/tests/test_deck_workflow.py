"""The workflow around a generated deck: PDF (#8), preview (#9), partial run (#10), comparison
(#11), review (#12), scheduled attachment (#13), share links (#14) and audiences (#25)."""

from __future__ import annotations

import asyncio
import shutil
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from cadencia import notify
from cadencia.api.app import create_app
from cadencia.api.deps import clock
from cadencia.collector.scheduler import deck_attachment
from cadencia.report.core.sample_template import build_sample_template
from cadencia.store import schema as s
from cadencia.store.db import session_scope
from tests.support import NOW, PT_BR, collect_demo, make_settings


def ok(response):
    assert response.status_code < 300, response.text
    return response.json()


def _app(settings, sessions):
    app = create_app(settings, sessions)
    app.dependency_overrides[clock] = lambda: NOW
    return app


@pytest.fixture
def client(demo, sessions, settings):
    asyncio.run(collect_demo(demo, sessions, settings))
    with TestClient(_app(settings, sessions), headers=PT_BR) as test_client:
        yield test_client


@pytest.fixture
def template(client, tmp_path):
    path = build_sample_template(tmp_path / "modelo.pptx")
    template = ok(client.post("/api/reports/templates", files={"file": ("modelo.pptx", path.read_bytes())}))
    detail = ok(client.get(f"/api/reports/templates/{template['id']}"))
    return {"id": template["id"], "slides": [s["slide_id"] for s in detail["manifest"]["slides"]]}


def generate(client, template_id, **body):
    return ok(
        client.post("/api/reports/generate", json={"template_id": template_id, "render": False, **body})
    )


def test_preview_and_partial_runs_stay_out_of_the_history(client, template):
    delivered = generate(client, template["id"])
    assert delivered["kind"] == "entrega" and delivered["seconds"] >= 0
    preview = ok(client.post(f"/api/reports/templates/{template['id']}/preview-run", json={"board_id": 1}))
    assert preview["kind"] == "previa" and preview["board_ids"] == [1]
    partial = ok(
        client.post(
            f"/api/reports/runs/{delivered['id']}/partial", json={"slide_ids": [template["slides"][0]]}
        )
    )
    assert partial["kind"] == "parcial" and partial["parent_run_id"] == delivered["id"]
    assert partial["reference_at"] == delivered["reference_at"]
    assert [p["origin_slide_id"] for p in partial["validation"]["produced"]] == [template["slides"][0]]
    # #27: "Atualizar números" redoes the whole deck at the current instant, still out of the history.
    fresh = ok(client.post(f"/api/reports/runs/{delivered['id']}/partial", json={"agora": True}))
    assert fresh["kind"] == "parcial" and fresh["reference_at"].startswith(NOW.isoformat()[:16])
    assert len(fresh["validation"]["produced"]) == len(delivered["validation"]["produced"])
    assert client.post(f"/api/reports/runs/{delivered['id']}/partial", json={}).status_code == 400
    history = ok(client.get("/api/reports/runs", params={"template_id": template["id"]}))["items"]
    assert [r["id"] for r in history] == [delivered["id"]]
    previews = ok(client.get("/api/reports/runs", params={"template_id": template["id"], "kind": "previa"}))
    assert [r["id"] for r in previews["items"]] == [preview["id"]]


def test_old_previews_are_pruned(client, template):
    for _ in range(5):
        ok(client.post(f"/api/reports/templates/{template['id']}/preview-run", json={"board_id": 1}))
    previews = ok(client.get("/api/reports/runs", params={"template_id": template["id"], "kind": "previa"}))
    assert len(previews["items"]) == 3


@pytest.mark.skipif(not shutil.which("soffice"), reason="LibreOffice renders the PDF")
def test_a_deck_downloads_as_pdf(client, template):
    run = generate(client, template["id"])
    response = client.get(f"/api/reports/runs/{run['id']}/file", params={"format": "pdf", "force": True})
    assert response.status_code == 200 and response.content.startswith(b"%PDF")
    assert response.headers["content-disposition"].endswith('.pdf"')


def test_two_runs_compare_slide_by_slide(client, template, sessions):
    first = generate(client, template["id"])
    second = generate(client, template["id"])
    same = ok(client.get(f"/api/reports/runs/{first['id']}/compare/{second['id']}"))
    assert same["same"] and same["slides"] == []
    partial = ok(
        client.post(f"/api/reports/runs/{first['id']}/partial", json={"slide_ids": [template["slides"][0]]})
    )
    fewer = ok(client.get(f"/api/reports/runs/{first['id']}/compare/{partial['id']}"))
    assert {s["change"] for s in fewer["slides"]} == {"removido"}


def test_compare_catches_chart_data_and_cell_colour_even_when_text_is_the_same(tmp_path):
    """#9: a table's own status colour and a chart's own values used to be invisible to the
    diff — only the words on the slide were compared, so a rule recolouring a cell or a chart
    changing shape passed as "same"."""
    from pptx import Presentation
    from pptx.chart.data import CategoryChartData
    from pptx.dml.color import RGBColor
    from pptx.enum.chart import XL_CHART_TYPE
    from pptx.util import Inches

    from cadencia.report.service import compare_runs

    def build(path, fill_hex, chart_value):
        prs = Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        table = slide.shapes.add_table(1, 2, 0, 0, Inches(3), Inches(1)).table
        table.cell(0, 0).text = "K-1"
        table.cell(0, 1).text = "Ok"
        table.cell(0, 1).fill.solid()
        table.cell(0, 1).fill.fore_color.rgb = RGBColor.from_string(fill_hex)
        data = CategoryChartData()
        data.categories = ["Sprint 1"]
        data.add_series("Concluídos", (chart_value,))
        slide.shapes.add_chart(
            XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(4), Inches(0), Inches(3), Inches(2), data
        )
        prs.save(path)

    build(tmp_path / "a.pptx", "00B050", 5.0)
    build(tmp_path / "b.pptx", "FF0000", 8.0)

    def row(run_id: str, path):
        return s.ReportRunRow(
            id=run_id,
            template_id=1,
            template_sha256="x",
            created_at=NOW,
            reference_at=NOW,
            board_ids=[],
            sprint_ids=[],
            status="ok",
            path=str(path),
            validation={"produced": [{"index": 1, "origin_slide_id": 900, "board_id": None, "page": 1}]},
        )

    result = compare_runs(row("a", tmp_path / "a.pptx"), row("b", tmp_path / "b.pptx"), {})
    assert result["same"] is False
    changed = result["slides"][0]["added"] + result["slides"][0]["removed"]
    assert any(line.startswith("cores:") for line in changed)
    assert any(line.startswith("gráfico") for line in changed)


def test_audience_can_ask_questions_and_the_presenter_moderates_them(client, template):
    """Slides' audience Q&A, scoped to people who already reach Cadência (no public join link —
    see `ReportQuestionRow`'s own docstring for why)."""
    run = generate(client, template["id"])
    base = f"/api/reports/runs/{run['id']}/questions"
    assert ok(client.get(base))["items"] == []
    q1 = ok(
        client.post(
            base, json={"texto": "  Qual o plano para o risco CAD-11?  "}, headers={"X-Remote-User": "ana"}
        )
    )
    assert (
        q1["text"] == "Qual o plano para o risco CAD-11?"
        and q1["author"] == "ana"
        and q1["answered_at"] is None
    )
    q2 = ok(client.post(base, json={"texto": "E o CAD-14?"}))
    # Newest first: the presenter is watching this live.
    items = ok(client.get(base))["items"]
    assert [i["id"] for i in items] == [q2["id"], q1["id"]]
    assert client.post(base, json={"texto": "   "}).status_code == 400
    answered = ok(client.patch(f"/api/reports/questions/{q1['id']}", json={"respondida": True}))
    assert answered["answered_at"] is not None
    reopened = ok(client.patch(f"/api/reports/questions/{q1['id']}", json={"respondida": False}))
    assert reopened["answered_at"] is None
    assert client.delete(f"/api/reports/questions/{q2['id']}").status_code == 204
    assert [i["id"] for i in ok(client.get(base))["items"]] == [q1["id"]]
    assert client.get("/api/reports/runs/naoexiste/questions").status_code == 404
    assert client.patch("/api/reports/questions/99999", json={"respondida": True}).status_code == 404


def test_review_flow_needs_a_valid_deck_and_no_open_comment(client, template, sessions):
    run = generate(client, template["id"])
    base = f"/api/reports/runs/{run['id']}/review"
    with session_scope(sessions) as session:  # a deck that passed validation, whatever the sample says
        session.get(s.ReportRunRow, run["id"]).status = "ok"
    assert client.post(base, json={"acao": "aprovar"}).status_code == 400  # not submitted yet
    sent = ok(client.post(base, json={"acao": "enviar"}, headers={"X-Remote-User": "ana"}))
    assert sent["review"]["status"] == "em_revisao" and sent["review"]["by"] == "ana"
    comment = ok(
        client.post(
            f"/api/reports/templates/{template['id']}/comments",
            json={"origin_slide_id": template["slides"][0], "body": "Falta o objetivo.", "author": "bia"},
        )
    )
    refused = client.post(base, json={"acao": "aprovar"})
    assert refused.status_code == 400 and "comentário" in refused.json()["detail"]["message"]
    ok(client.patch(f"/api/reports/comments/{comment['id']}", json={"resolved": True}))
    assert client.post(base, json={"acao": "reprovar"}).status_code == 400  # a rejection says why
    approved = ok(client.post(base, json={"acao": "aprovar"}, headers={"X-Remote-User": "bia"}))
    assert approved["review"] == {**approved["review"], "status": "aprovado", "by": "bia"}


def test_review_history_keeps_every_decision_even_after_a_later_one(client, template, sessions):
    run = generate(client, template["id"])
    base = f"/api/reports/runs/{run['id']}/review"
    with session_scope(sessions) as session:
        session.get(s.ReportRunRow, run["id"]).status = "ok"
    ok(client.post(base, json={"acao": "enviar"}, headers={"X-Remote-User": "ana"}))
    rejected = ok(
        client.post(
            base, json={"acao": "reprovar", "nota": "Falta o objetivo."}, headers={"X-Remote-User": "bia"}
        )
    )
    assert rejected["review"]["by"] == "bia" and rejected["review"]["note"] == "Falta o objetivo."
    ok(client.post(base, json={"acao": "enviar"}, headers={"X-Remote-User": "ana"}))
    approved = ok(client.post(base, json={"acao": "aprovar"}, headers={"X-Remote-User": "caio"}))
    # The current state only shows caio's approval — but bia's earlier rejection must not vanish.
    assert approved["review"]["by"] == "caio" and approved["review"]["note"] == ""
    history = approved["review"]["history"]
    assert [h["action"] for h in history] == ["enviar", "reprovar", "enviar", "aprovar"]
    assert history[1] == {
        "action": "reprovar",
        "by": "bia",
        "at": history[1]["at"],
        "note": "Falta o objetivo.",
    }


def test_a_template_can_require_approval_before_download(client, template, sessions):
    ok(client.put(f"/api/reports/templates/{template['id']}/mapping", json={"require_approval": True}))
    run = generate(client, template["id"])
    with session_scope(sessions) as session:
        session.get(s.ReportRunRow, run["id"]).status = "ok"
    blocked = client.get(f"/api/reports/runs/{run['id']}/download")
    assert (
        blocked.status_code == 409 and blocked.json()["detail"]["cause"] == "apresentação ainda não aprovada"
    )
    assert client.get(f"/api/reports/runs/{run['id']}/download", params={"force": True}).status_code == 200
    ok(client.post(f"/api/reports/runs/{run['id']}/review", json={"acao": "enviar"}))
    ok(client.post(f"/api/reports/runs/{run['id']}/review", json={"acao": "aprovar"}))
    assert client.get(f"/api/reports/runs/{run['id']}/download").status_code == 200


def test_audiences_narrow_the_slides(client, template):
    first, second = template["slides"][0], template["slides"][1]
    ok(
        client.put(
            f"/api/reports/templates/{template['id']}/mapping",
            json={"audiences": ["Executivo", "Time"], "slides": {str(second): {"only_audiences": ["Time"]}}},
        )
    )
    full = generate(client, template["id"])
    executive = generate(client, template["id"], audience="Executivo")
    team = generate(client, template["id"], audience="Time")
    origins = lambda run: {p["origin_slide_id"] for p in run["validation"]["produced"]}  # noqa: E731
    assert second in origins(full) and second in origins(team) and second not in origins(executive)
    assert first in origins(executive) and executive["audience"] == "Executivo"
    unknown = client.post(
        "/api/reports/generate", json={"template_id": template["id"], "audience": "Diretoria"}
    )
    assert unknown.status_code == 400


def test_share_links_open_one_deck_without_the_api_token(sessions, tmp_path, demo):
    settings = make_settings(tmp_path, api_token="s3cret", public_url="https://cadencia.example")
    asyncio.run(collect_demo(demo, sessions, settings))
    auth = {"Authorization": "Bearer s3cret"}
    with TestClient(_app(settings, sessions), headers=PT_BR) as client:
        path = build_sample_template(tmp_path / "modelo.pptx")
        template = client.post(
            "/api/reports/templates", files={"file": ("m.pptx", path.read_bytes())}, headers=auth
        )
        run = client.post(
            "/api/reports/generate",
            json={"template_id": template.json()["id"], "render": False},
            headers=auth,
        ).json()
        share = client.post(f"/api/reports/runs/{run['id']}/shares", json={"dias": 7}, headers=auth).json()
        assert share["url"] == f"https://cadencia.example/shared/{share['token']}"
        public = client.get(f"/api/public/decks/{share['token']}")  # no token at all
        assert public.status_code == 200
        body = public.json()
        assert body["scene"]["image_base"].endswith("/images") and body["scene"]["run_id"] is None
        assert body["scene"]["slides"]
        # The public prefix opens only GETs of one deck: no listing, no writing, no guessing.
        assert client.get("/api/public/decks/nao-existe").status_code == 404
        assert client.delete(f"/api/reports/shares/{share['token']}").status_code == 401
        assert client.post(f"/api/public/decks/{share['token']}").status_code == 401
        assert client.delete(f"/api/reports/shares/{share['token']}", headers=auth).status_code == 204
        assert client.get(f"/api/public/decks/{share['token']}").status_code == 404
        listed = client.get(f"/api/reports/runs/{run['id']}/shares", headers=auth).json()["items"]
        assert listed[0]["revoked"] and listed[0]["views"] == 1


def test_an_expired_share_link_is_dead(client, template, sessions):
    run = generate(client, template["id"])
    share = ok(client.post(f"/api/reports/runs/{run['id']}/shares", json={}))
    with session_scope(sessions) as session:
        session.get(s.DeckShareRow, share["token"]).expires_at = datetime.now(UTC) - timedelta(minutes=1)
    assert client.get(f"/api/public/decks/{share['token']}").status_code == 404


def test_scheduled_delivery_attaches_the_file_to_email(client, template, sessions, settings, monkeypatch):
    run_id = generate(client, template["id"])["id"]
    sent = []

    class FakeSMTP:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self):
            pass

        def login(self, *args):
            pass

        def send_message(self, email):
            sent.append(email)

    monkeypatch.setattr(notify.smtplib, "SMTP", FakeSMTP)
    mail_settings = settings.model_copy(update={"smtp_host": "smtp.example"})
    with session_scope(sessions) as session:
        run = session.get(s.ReportRunRow, run_id)
        run.status = "ok"
        assert deck_attachment(mail_settings, run, "link") is None
        attachment = deck_attachment(mail_settings, run, "pptx")
        assert attachment is not None and attachment[0].endswith(".pptx") and attachment[1][:2] == b"PK"
        message = notify.Message(event="deck", title="Deck", text="pronto", attachments=[attachment])
        notify._send_email(mail_settings, ["time@example.com"], message)
        run.status = "invalid"
        assert deck_attachment(mail_settings, run, "pptx") is None  # a refused deck travels as a link
    [email] = sent
    assert [part.get_filename() for part in email.iter_attachments()] == [attachment[0]]


def test_the_narrative_route_says_clearly_when_ai_is_off(client, template):
    assert ok(client.get("/api/reports/ai")) == {"enabled": False, "model": None}
    refused = client.post(f"/api/reports/templates/{template['id']}/narrative", json={"board_id": 1})
    assert refused.status_code == 503 and refused.json()["detail"]["cause"] == "sugestão por IA indisponível"
