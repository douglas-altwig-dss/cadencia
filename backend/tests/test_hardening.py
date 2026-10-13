"""What the API refuses to do: serve outside its folders, trust an upload, answer a bug with 404."""

import asyncio
import io
import zipfile
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from cadencia.api import routes_setup
from cadencia.api.app import create_app
from cadencia.api.deps import clock, stored_file
from cadencia.api.routes_export import to_csv
from cadencia.collector.service import COLLECT_LEASE, LEASE_TTL
from cadencia.store import repo
from cadencia.store import schema as s
from cadencia.store.db import session_scope
from tests.support import NOW, PT_BR, collect_demo, make_settings


def _client(settings, sessions, **kwargs):
    app = create_app(settings, sessions)
    app.dependency_overrides[clock] = lambda: NOW
    return TestClient(app, **{"headers": PT_BR, **kwargs})


@pytest.fixture
def client(demo, sessions, settings):
    asyncio.run(collect_demo(demo, sessions, settings))
    with _client(settings, sessions) as test_client:
        yield test_client


def _png(width=30, height=20) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "red").save(buffer, "PNG")
    return buffer.getvalue()


# ------------------------------------------------------------------ the API token


def test_a_configured_token_is_required_everywhere_but_health(sessions, tmp_path):
    settings = make_settings(tmp_path, api_token="s3cret")
    with _client(settings, sessions) as client:
        refused = client.get("/api/boards")
        assert refused.status_code == 401
        assert refused.headers["www-authenticate"] == "Bearer"
        assert refused.json()["detail"]["cause"] == "credencial ausente ou inválida"
        assert client.get("/api/boards", headers={"Authorization": "Bearer errado"}).status_code == 401
        assert client.get("/api/boards", headers={"Authorization": "Bearer s3cret"}).status_code == 200

        # Public for health checks, but it only names the Jira instance to a caller with the token.
        anonymous = client.get("/api/health")
        assert anonymous.status_code == 200 and anonymous.json()["jira_base_url"] is None
        signed = client.get("/api/health", headers={"Authorization": "Bearer s3cret"}).json()
        assert signed["jira_base_url"] == "https://demo.atlassian.net"


def test_without_a_token_the_api_stays_open(sessions, settings):
    with _client(settings, sessions) as client:
        assert client.get("/api/boards").status_code == 200
        assert client.get("/api/health").json()["jira_base_url"] == "https://demo.atlassian.net"


def test_every_response_says_nosniff(client):
    assert client.get("/api/health").headers["x-content-type-options"] == "nosniff"
    assert client.get("/api/reports/templates/9999").headers["x-content-type-options"] == "nosniff"


# ------------------------------------------------------------------ errors that are bugs


def test_a_bare_key_error_is_a_500_not_a_not_found(sessions, settings):
    app = create_app(settings, sessions)

    @app.get("/api/boom")
    def boom() -> dict:
        return {}["missing"]

    with TestClient(app, raise_server_exceptions=False, headers=PT_BR) as client:
        response = client.get("/api/boom")
    assert response.status_code == 500
    assert response.json()["detail"]["cause"] == "erro interno"
    assert "KeyError" in response.json()["detail"]["message"]


def test_a_missing_thing_is_still_a_404(client):
    assert client.get("/api/boards/999/sprints").status_code == 404
    assert client.get("/api/issues/CAD-999").status_code == 404
    missing = client.get("/api/epics/CAD-11", params={"board_id": 2})
    assert missing.status_code == 404 and "CAD-11" in missing.json()["detail"]["message"]


# ------------------------------------------------------------------ board settings


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"timezone": "Mars/Base"}, "fuso horário desconhecido"),
        ({"checkpoint_weekday": 9}, "entre 0 e 6"),
        ({"checkpoint_hour": 24}, "entre 0 e 23"),
        ({"checkpoint_hour": True}, "número inteiro"),
        ({"aging_percentile": "abc"}, "número"),
        ({"focus_factor": 0}, "entre 0.01 e 1"),
        ({"holidays": ["2026-13-01"]}, "data inválida"),
        ({"blocked_status_names": "Bloqueado"}, "lista de textos"),
    ],
)
def test_board_settings_that_would_break_a_view_are_refused(client, change, message):
    response = client.put("/api/boards/1/settings", json=change)
    assert response.status_code == 400, response.text
    assert message in response.json()["detail"]["message"]
    # Nothing was stored: the board's views still work.
    assert client.get("/api/boards/1/sprints").status_code == 200


def test_valid_board_settings_and_resets_still_save(client):
    saved = client.put(
        "/api/boards/1/settings",
        json={"timezone": "America/Manaus", "checkpoint_weekday": 3, "holidays": ["2026-09-07"]},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["settings"]["timezone"] == "America/Manaus"
    reset = client.put("/api/boards/1/settings", json={"timezone": None})
    assert reset.status_code == 200 and reset.json()["settings"]["timezone"] == "America/Sao_Paulo"


def test_field_overrides_are_typed(client):
    assert client.put("/api/fields/overrides", json={"sprint": ["x"]}).status_code == 422
    saved = client.put("/api/fields/overrides", json={"rank": "customfield_10019", "extra": 1})
    assert saved.status_code == 200 and saved.json()["overrides"] == {"rank": "customfield_10019"}


# ------------------------------------------------------------------ files on disk


def test_a_run_file_cannot_climb_out_of_the_decks_folder(client, settings):
    secret = settings.data_dir / "cadencia.db"
    secret.parent.mkdir(parents=True, exist_ok=True)
    secret.write_text("o banco inteiro")
    # httpx would normalise a literal "..", so send it encoded: the router decodes it back.
    for run_id in ("%2E%2E", "%2e%2e", "."):
        response = client.get(f"/api/reports/runs/{run_id}/files/cadencia.db")
        assert response.status_code in {400, 404}, run_id
        assert "o banco inteiro" not in response.text


def test_stored_file_stays_inside_its_root(tmp_path):
    root = tmp_path / "decks"
    (root / "abc123").mkdir(parents=True)
    (root / "abc123" / "slide-1.png").write_bytes(b"png")
    (tmp_path / "outside.txt").write_text("não")
    (root / "abc123" / "escape.txt").symlink_to(tmp_path / "outside.txt")
    assert stored_file(root, "abc123", "slide-1.png") == root / "abc123" / "slide-1.png"
    for parts in [("..", "outside.txt"), (".", "abc123"), ("abc123", ".hidden"), ("abc123", "a/b")]:
        with pytest.raises(Exception) as caught:
            stored_file(root, *parts)
        assert caught.value.status_code == 400
    with pytest.raises(Exception) as caught:
        stored_file(root, "abc123", "escape.txt")  # a symlink pointing out of the folder
    assert caught.value.status_code == 404


# ------------------------------------------------------------------ uploads


def test_an_uploaded_image_is_typed_by_its_bytes_not_by_the_client(client):
    uploaded = client.post("/api/reports/assets", files={"file": ("foto.txt", _png(30, 20), "text/html")})
    assert uploaded.status_code == 201, uploaded.text
    body = uploaded.json()
    assert body["content_type"] == "image/png"
    # The size used to be 0 x 0 always: the import that measured it did not exist.
    assert (body["width"], body["height"]) == (30, 20)
    served = client.get(body["url"])
    assert served.headers["content-type"] == "image/png"
    assert served.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize(
    "content",
    [b"<html><script>alert(document.cookie)</script></html>", b'<svg xmlns="http://www.w3.org/2000/svg"/>'],
)
def test_something_that_is_not_an_image_is_refused(client, content):
    refused = client.post("/api/reports/assets", files={"file": ("x.png", content, "image/png")})
    assert refused.status_code == 400
    assert "não é uma imagem" in refused.json()["detail"]["message"]


def test_an_asset_stored_before_the_check_is_served_as_a_download(client, sessions, settings):
    path = settings.data_dir / "assets" / "legado.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("<script>alert(1)</script>")
    with session_scope(sessions) as session:
        session.add(
            s.AssetRow(
                id="legado",
                filename="legado.html",
                content_type="text/html",
                path=str(path),
                uploaded_at=datetime(2026, 9, 1, tzinfo=UTC),
            )
        )
    served = client.get("/api/reports/assets/legado")
    assert served.headers["content-type"] == "application/octet-stream"
    assert served.headers["content-disposition"].startswith("attachment")


def test_a_template_over_the_size_limit_is_refused(sessions, tmp_path):
    settings = make_settings(tmp_path, template_max_mb=1)
    with _client(settings, sessions) as client:
        too_big = b"\0" * (1024 * 1024 + 1)
        response = client.post("/api/reports/templates", files={"file": ("grande.pptx", too_big)})
        assert response.status_code == 413

        # Small on the wire, huge once unpacked: refused before python-pptx inflates it.
        bomb = io.BytesIO()
        with zipfile.ZipFile(bomb, "w", zipfile.ZIP_DEFLATED) as package:
            package.writestr("ppt/presentation.xml", b"\0" * (11 * 1024 * 1024))
        assert len(bomb.getvalue()) < 1024 * 1024
        response = client.post("/api/reports/templates", files={"file": ("bomba.pptx", bomb.getvalue())})
        assert response.status_code == 400 and "descompactado" in response.json()["detail"]["message"]


# ------------------------------------------------------------------ exports


def test_csv_cells_that_look_like_formulas_are_quoted():
    text = to_csv(
        [
            {
                "summary": '=HYPERLINK("http://x","clique")',
                "who": "@ana",
                "delta": -3,
                "note": "+1",
                "ok": "Normal",
            }
        ]
    )
    header, row = text.removeprefix("\ufeff").splitlines()
    assert header == "summary;who;delta;note;ok"
    assert row == '"\'=HYPERLINK(""http://x"",""clique"")";\'@ana;-3;\'+1;Normal'


# ------------------------------------------------------------------ one collection at a time


def test_a_collection_held_elsewhere_shows_as_running_and_refuses_another(client, sessions):
    with session_scope(sessions) as session:
        assert repo.acquire_lease(session, COLLECT_LEASE, "agendador", LEASE_TTL)
    assert client.get("/api/status").json()["collecting"] is True
    refused = client.post("/api/collect", json={"mode": "incremental"})
    assert refused.status_code == 409


def test_an_accepted_collection_hands_its_lease_to_the_job(client, sessions, monkeypatch):
    seen = {}

    async def fake_collection(_settings, _sessions, **kwargs):
        with session_scope(sessions) as session:
            seen["holder"] = repo.lease_holder(session, COLLECT_LEASE)
        seen.update(kwargs)
        return {"status": "success"}

    monkeypatch.setattr(routes_setup, "run_collection", fake_collection)
    accepted = client.post("/api/collect", json={"mode": "full"})
    assert accepted.status_code == 202
    run_id = accepted.json()["run_id"]
    assert seen["holder"] == run_id and seen["run_id"] == run_id and seen["mode"] == "full"
    with session_scope(sessions) as session:  # released once the job is over
        assert repo.lease_holder(session, COLLECT_LEASE) is None
    assert client.get("/api/status").json()["collecting"] is False


def test_request_time_is_rounded_to_the_minute():
    now = clock()
    assert now.second == 0 and now.microsecond == 0 and now.tzinfo is not None
