"""People: the indicators behind the cards and the tiles, and each person's availability."""

from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

from cadencia.analytics.people_overview import BLOCK_DAYS, _OnBoard, has_activity, severity
from cadencia.api.app import create_app
from cadencia.api.deps import clock
from cadencia.domain.capacity import Availability, sprint_capacity
from cadencia.domain.models import BoardProfile, Person
from cadencia.store.db import make_engine, upgrade
from tests.support import NOW, PT_BR, collect_demo


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


def overview(client):
    data = ok(client.get("/api/people/overview"))
    return {p["account_id"]: p for p in data["items"]}, data["summary"]


def test_overview_is_a_number_per_person_and_never_a_list_of_items(client):
    people, summary = overview(client)
    assert list(people) == sorted(people, key=lambda a: people[a]["name"].casefold())
    for person in people.values():
        assert set(person) == {
            "account_id", "name", "active", "boards", "workload", "delivered", "blocks", "past", "availability",
        }  # fmt: skip
    assert summary["people"] == len(people)
    assert summary["state"] == "acima" and summary["ratio"] == round(
        summary["hours"] / summary["capacity_hours"], 3
    )
    assert summary["committed"] == sum(p["delivered"]["committed"] or 0 for p in people.values())


def test_workload_is_open_hours_over_the_capacity_left(client):
    ana = overview(client)[0]["demo-ana"]["workload"]
    # Ana has CAD-17 (5 points) open; Thursday and Friday are left at 8 h × 0.7 focus.
    assert ana["window"] == "sprint" and ana["ends_on"] == "2026-09-11"
    assert ana["capacity_hours"] == 11.2 and ana["hours"] == 20.0 and ana["open_items"] == 1
    assert ana["ratio"] == round(20.0 / 11.2, 3) and ana["state"] == "acima"
    # Done work does not count: CAD-10, CAD-15 and CAD-20 are finished.
    delivered = overview(client)[0]["demo-ana"]["delivered"]
    assert delivered["count"] == 2 and delivered["committed"] == 2


def test_a_block_is_any_fired_blocking_rule_and_ages_into_a_severity(client):
    diego = overview(client)[0]["demo-diego"]["blocks"]
    # CAD-13 is flagged in Jira (7 days) and CAD-18 waits on CAD-11 by a link: both are blocks even
    # though CAD-13's main situation may be another one.
    assert diego["count"] == 2 and diego["alta"] == 2 and diego["oldest_days"] >= 7
    assert overview(client)[0]["demo-ana"]["blocks"]["count"] == 0
    assert overview(client)[1]["blocks"]["count"] == 2


def test_severity_bands():
    low, medium = BLOCK_DAYS
    assert (severity(0), severity(low - 1)) == ("baixa", "baixa")
    assert (severity(low), severity(medium)) == ("media", "media")
    assert severity(medium + 1) == "alta"


def test_past_sprints_give_a_trend_without_inventing_history(client):
    people, _ = overview(client)
    ana = people["demo-ana"]["past"]
    assert [p["delivered"] for p in ana["points"]] == [1, 2] and ana["delta"] == 1 and ana["adherence"] == 1.0
    # Elisa joined later: the slot before her first sprint is empty, not zero.
    elisa = people["demo-elisa"]["past"]
    assert elisa["points"][0]["delivered"] is None and elisa["delta"] is None


def test_availability_scales_capacity_and_the_default_is_no_row(client):
    before = overview(client)[0]["demo-ana"]["workload"]["capacity_hours"]
    saved = ok(client.put("/api/people/demo-ana/availability", json={"hours_per_day": 4, "allocation": 50}))
    assert saved["hours_per_day"] == 4 and saved["allocation"] == 50 and saved["board_hours_per_day"] == 8
    after = overview(client)[0]["demo-ana"]
    assert after["workload"]["capacity_hours"] == before / 2 / 2 == 2.8
    assert after["availability"] == {"hours_per_day": 4, "allocation": 50}
    # The sprint capacity screen reads the same registration.
    row = next(
        r for r in ok(client.get("/api/sprints/12/capacity"))["items"] if r["account_id"] == "demo-ana"
    )
    assert row["hours_per_day"] == 4 and row["allocation"] == 0.5
    # Back to the defaults removes the row instead of storing a no-op.
    ok(client.put("/api/people/demo-ana/availability", json={"hours_per_day": None, "allocation": 100}))
    assert ok(client.get("/api/people/demo-ana/availability"))["hours_per_day"] is None
    assert overview(client)[0]["demo-ana"]["workload"]["capacity_hours"] == before


def test_availability_is_validated_and_needs_a_known_person(client):
    assert client.put("/api/people/demo-ana/availability", json={"hours_per_day": 30}).status_code == 400
    assert client.put("/api/people/demo-ana/availability", json={"allocation": 140}).status_code == 400
    assert client.put("/api/people/ninguem/availability", json={"allocation": 50}).status_code == 404
    assert client.get("/api/people/ninguem/availability").status_code == 404


def test_an_absence_over_the_rest_of_the_sprint_leaves_no_capacity(client):
    day = NOW.date()
    ok(
        client.post(
            "/api/absences",
            json={
                "account_id": "demo-ana",
                "start": day.isoformat(),
                "end": (day + timedelta(days=1)).isoformat(),
            },
        )
    )
    ana = overview(client)[0]["demo-ana"]["workload"]
    assert ana["capacity_hours"] == 0 and ana["state"] == "sem_capacidade" and ana["ratio"] is None
    mine = ok(client.get("/api/absences", params={"account_id": "demo-ana"}))["items"]
    assert len(mine) == 1
    assert ok(client.get("/api/absences", params={"account_id": "demo-bruno"}))["items"] == []


def test_capacity_defaults_are_unchanged_for_someone_nobody_registered():
    profile = BoardProfile.from_parts(1, [], {}, {})
    person = Person("a", "A")
    start, end = NOW.date(), NOW.date() + timedelta(days=1)
    plain = sprint_capacity([person], start, end, profile)[0]
    same = sprint_capacity([person], start, end, profile, availability={"b": Availability(4, 0.5)})[0]
    assert plain == same and plain.allocation == 1.0
    half = sprint_capacity([person], start, end, profile, availability={"a": Availability(None, 0.5)})[0]
    assert half.hours == plain.hours / 2
    # A day length set for everyone (a what-if) still wins over a registered one.
    assert (
        sprint_capacity(
            [person], start, end, profile, hours_per_day=6, availability={"a": Availability(4, 1.0)}
        )[0].hours_per_day
        == 6
    )


def test_migration_0014_adds_the_availability(tmp_path):
    url = f"sqlite:///{tmp_path / 'cadencia.db'}"
    upgrade(url)
    engine = make_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE person_availability"))
        connection.execute(text("UPDATE alembic_version SET version_num = '0013'"))
    upgrade(url)
    assert "person_availability" in inspect(engine).get_table_names()


def test_a_sprint_nobody_closed_after_its_end_is_counted_over_the_week(demo, sessions, settings):
    asyncio.run(collect_demo(demo, sessions, settings))
    app = create_app(settings, sessions)
    # Wednesday of the week after: sprint 12 ended on Friday the 11th but is still open in Jira.
    app.dependency_overrides[clock] = lambda: NOW + timedelta(days=6)
    with TestClient(app, headers=PT_BR) as late:
        ana = next(p for p in ok(late.get("/api/people/overview"))["items"] if p["account_id"] == "demo-ana")
    work = ana["workload"]
    assert work["window"] == "sprint" and work["sprint_overdue"] is True
    assert work["ends_on"] == "2026-09-18"  # that week's Friday
    assert work["capacity_hours"] == pytest.approx(3 * 8 * 0.7) and work["state"] != "sem_capacidade"


def detail(client, account_id):
    return ok(client.get(f"/api/people/{account_id}/detail"))


def test_the_detail_lists_items_epics_and_blocks_of_one_person(client):
    diego = detail(client, "demo-diego")
    assert diego["person"]["name"] == "Diego Rocha"
    assert diego["indicators"]["blocks"]["count"] == 2
    open_keys = {i["key"] for i in diego["items"] if i["open"]}
    assert {"CAD-13", "CAD-18"} <= open_keys
    assert {b["key"] for b in diego["blocks"]} == {"CAD-13", "CAD-18"}
    assert diego["blocks"][0]["blocked_days"] >= diego["blocks"][1]["blocked_days"]
    assert all(b["block_reason"] for b in diego["blocks"])
    # CAD-13 hangs from CAD-1; the epic card counts it as blocked.
    epic = next(e for e in diego["epics"] if e["key"] == "CAD-1")
    assert epic["blocked"] >= 1 and epic["open"] >= 1
    # Someone else's items never leak in.
    assert all(i["assignee_id"] == "demo-diego" for i in diego["items"])


def test_the_week_reads_as_signals_not_a_verdict(client):
    diego = detail(client, "demo-diego")["week"]
    kinds = {s["kind"]: s for s in diego["signals"]}
    assert diego["status"] == "dificuldades"
    assert kinds["bloqueios"]["count"] == 2 and kinds["bloqueios"]["level"] == "alto"
    assert kinds["sobrecarga"]["ratio"] > 1.1
    ana = detail(client, "demo-ana")["week"]
    assert ana["counts"]["finished"] >= 1  # CAD-10 and CAD-15 were finished this week
    assert all(s["kind"] != "bloqueios" for s in ana["signals"])


def test_the_timeline_runs_from_in_progress_to_done_or_now(client):
    bars = {b["key"]: b for b in detail(client, "demo-ana")["timeline"]["items"]}
    assert bars["CAD-10"]["state"] == "concluido" and bars["CAD-10"]["start"] < bars["CAD-10"]["end"]
    # CAD-17 is open but never entered a working status, so it has no bar at all.
    assert "CAD-17" not in bars
    assert all(b["began"] <= b["end"] for b in bars.values())
    diego = {b["key"]: b for b in detail(client, "demo-diego")["timeline"]["items"]}
    assert diego["CAD-13"]["state"] == "bloqueado"


def test_capacity_per_sprint_sets_commitment_against_hours(client):
    sprints = detail(client, "demo-ana")["capacity"]["sprints"]
    assert sprints and all(s["capacity_hours"] > 0 for s in sprints)
    current = next(s for s in sprints if s["sprint"]["state"] == "active")
    assert current["committed"] == 2 and current["committed_hours"] > 0
    ok(client.put("/api/people/demo-ana/availability", json={"allocation": 50}))
    halved = next(
        s for s in detail(client, "demo-ana")["capacity"]["sprints"] if s["sprint"]["state"] == "active"
    )
    assert halved["capacity_hours"] == current["capacity_hours"] / 2


def test_an_unknown_person_has_no_detail(client):
    assert client.get("/api/people/ninguem/detail").status_code == 404


def _on(**counts):
    return _OnBoard(1, "Plataforma", None, None, **counts)


def test_activity_in_the_sprint_is_open_work_a_delivery_or_a_commitment():
    assert has_activity([_on(open_items=1)])
    assert has_activity([_on(delivered=2)])
    # A commitment counts even when it was delivered or taken out since: they had a part in the sprint.
    assert has_activity([_on(committed=1)])
    # Holding only subtasks is activity: a team that plans in subtasks is not idle.
    assert has_activity([_on(activity=3)])
    # Nothing open, nothing delivered, nothing committed: only history, or only blocks.
    assert not has_activity([_on()])
    assert not has_activity([_on(blocked_days=[9], past=[{"sprint": "S1", "delivered": 3, "committed": 3}])])
    # On two boards, activity on either is activity.
    assert has_activity([_on(), _on(open_items=1)])
    assert not has_activity([])


def test_the_overview_says_who_is_active_in_the_sprint(client):
    people, _ = overview(client)
    assert all(isinstance(p["active"], bool) for p in people.values())
    ana = people["demo-ana"]
    assert ana["active"] and (
        ana["workload"]["open_items"] or ana["delivered"]["count"] or ana["delivered"]["committed"]
    )
    # Whoever holds stories or deliveries in the sprint is active, whatever the level of their items.
    for person in people.values():
        if (
            person["workload"]["open_items"]
            or person["delivered"]["count"]
            or person["delivered"]["committed"]
        ):
            assert person["active"], person["name"]


@pytest.fixture
def plan_client(sessions, settings):
    """The epic-plan demo: board 4 plans in subtasks, so nobody holds a story."""
    from cadencia.demo import DemoJira

    asyncio.run(collect_demo(DemoJira(NOW, epic_plan=True), sessions, settings, select=(4,)))
    app = create_app(settings, sessions)
    app.dependency_overrides[clock] = lambda: NOW
    with TestClient(app, headers=PT_BR) as test_client:
        yield test_client


def test_someone_holding_only_subtasks_is_active(plan_client):
    people = {p["account_id"]: p for p in ok(plan_client.get("/api/people/overview"))["items"]}
    assert people
    busy = [p for p in people.values() if p["workload"]["open_items"] == 0]
    # The load counts stories, and this team has none — yet the people are working: they hold subtasks.
    assert busy and all(p["active"] for p in busy)
