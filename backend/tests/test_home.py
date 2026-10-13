"""The Home mosaic: a layout per user kept in the local database, and the team pulse."""

from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from cadencia.api.app import create_app
from cadencia.api.deps import clock
from tests.support import NOW, PT_BR, collect_demo


@pytest.fixture
def make_client(demo, sessions, settings):
    asyncio.run(collect_demo(demo, sessions, settings))

    def build(at=NOW, **kwargs):
        app = create_app(settings, sessions)
        app.dependency_overrides[clock] = lambda: at
        headers = {**PT_BR, **kwargs.pop("headers", {})}
        return TestClient(app, headers=headers, **kwargs)

    return build


def ok(response):
    assert response.status_code < 300, response.text
    return response.json()


LAYOUT = {
    "version": 1,
    "tiles": [
        {"id": "kpi:risk", "type": "kpi:risk", "size": "P"},
        {"id": "boards", "type": "boards", "size": "G", "config": {"hidden": ["trend"]}},
    ],
}


def test_a_layout_is_kept_per_user_in_the_local_database(make_client):
    with (
        make_client() as anonymous,
        make_client(headers={"X-Remote-User": "ana"}) as ana,
        make_client(headers={"X-Remote-User": "bruno"}) as bruno,
    ):
        assert ok(ana.get("/api/home/layout")) == {"layout": None, "user": "ana", "shared": False}
        saved = ok(ana.put("/api/home/layout", json=LAYOUT))
        assert saved["layout"]["tiles"][1]["config"] == {"hidden": ["trend"]} and saved["user"] == "ana"
        assert ok(ana.get("/api/home/layout"))["layout"] == saved["layout"]
        # Somebody else, and the shared one, do not see it.
        assert ok(bruno.get("/api/home/layout"))["layout"] is None
        shared = ok(anonymous.get("/api/home/layout"))
        assert shared["layout"] is None and shared["shared"] is True and shared["user"] is None
        # Bruno's own arrangement does not touch Ana's.
        ok(bruno.put("/api/home/layout", json={"tiles": [{"id": "team:load", "type": "team:load"}]}))
        assert [t["id"] for t in ok(ana.get("/api/home/layout"))["layout"]["tiles"]] == ["kpi:risk", "boards"]
        assert ok(bruno.get("/api/home/layout"))["layout"]["tiles"][0]["size"] == "M"  # the default size
        # Back to the default removes it.
        assert ana.delete("/api/home/layout").status_code == 204
        assert ok(ana.get("/api/home/layout"))["layout"] is None
        assert ok(bruno.get("/api/home/layout"))["layout"] is not None


def test_a_bad_layout_is_refused(make_client):
    with make_client() as client:
        twice = {"tiles": [{"id": "a", "type": "kpi:risk"}, {"id": "a", "type": "boards"}]}
        assert client.put("/api/home/layout", json=twice).status_code == 400
        big = {"tiles": [{"id": "a", "type": "boards", "config": {"x": "y" * 5000}}]}
        assert client.put("/api/home/layout", json=big).status_code == 400
        assert client.put(
            "/api/home/layout", json={"tiles": [{"id": "a", "type": "x", "size": "XL"}]}
        ).status_code in (400, 422)
        many = {"tiles": [{"id": str(i), "type": "boards"} for i in range(41)]}
        assert client.put("/api/home/layout", json=many).status_code in (400, 422)
        assert ok(client.get("/api/home/layout"))["layout"] is None  # nothing half-saved


def test_the_pulse_counts_recent_deliveries_and_what_is_due(make_client):
    with make_client() as client:
        pulse = ok(client.get("/api/home/pulse"))
    days = pulse["recent"]["days"]
    assert len(days) == 7 and days[-1]["date"] == NOW.date().isoformat()
    assert pulse["recent"]["total"] == sum(d["delivered"] for d in days) > 0
    assert pulse["recent"]["previous_total"] >= 0
    assert pulse["due"]["overdue"] == 2  # CAD-14 and one more are past their date


def test_the_feed_says_what_was_delivered_blocked_and_added(make_client):
    with make_client(NOW - timedelta(days=7)) as client:
        feed = ok(client.get("/api/home/pulse"))["feed"]
    kinds = {(e["kind"], e["key"]) for e in feed}
    assert {("entregue", "DAD-2"), ("bloqueado", "CAD-13"), ("escopo", "CAD-15")} <= kinds
    assert [e["at"] for e in feed] == sorted((e["at"] for e in feed), reverse=True)  # newest first
    added = next(e for e in feed if e["kind"] == "escopo")
    assert added["who"] == "Ana Souza" and added["board"]["name"]
    # A delivery counts once, even though the item was reopened and finished again.
    assert sum(1 for e in feed if e["kind"] == "entregue" and e["key"] == "CAD-22") == 1
