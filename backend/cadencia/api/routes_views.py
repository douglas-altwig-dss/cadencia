"""Read views: dashboard, sprint drill-down, risks, items, flow and people (RF-06 … RF-33)."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import select

from cadencia.analytics import flow
from cadencia.analytics import sprint as sprint_views
from cadencia.analytics.dashboard import dashboard as dashboard_view
from cadencia.analytics.serialize import sprint_dict, window_dict
from cadencia.api.deps import (
    JSONDict,
    Now,
    SessionDep,
    SettingsDep,
    base_url,
    board_data,
    board_for_issue,
    committed_lookup,
    csv_ints,
    csv_strs,
    parse_instant,
    selected_or,
    sprint_or_404,
)
from cadencia.domain.calendar import sprint_timeline
from cadencia.i18n import render, tr
from cadencia.store import repo
from cadencia.store import schema as s

router = APIRouter(tags=["views"])
DEFAULT_WEEKS = 12


@router.get("/dashboard")
def dashboard(session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    return dashboard_view(session, repo.profile_defaults(settings), now, history_days=settings.history_days)


@router.get("/boards/{board_id}/sprints")
def board_sprints(board_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    data = board_data(session, settings, board_id)
    current = data.current_sprint(now)
    items = []
    for sprint in sorted(
        data.sprints.values(), key=lambda x: (x.start is None, x.start or now), reverse=True
    ):
        timeline = sprint_timeline(sprint, data.profile)
        items.append(
            {
                **sprint_dict(sprint),
                "windows": [window_dict(w) for w in timeline.windows],
                "warnings": [render(w) for w in timeline.warnings],
                "current": current is not None and sprint.id == current.id,
            }
        )
    return {
        "board": {"id": data.board.id, "name": data.board.name, "type": data.board.type},
        "current_sprint_id": current.id if current else None,
        "sprints": items,
        "freshness": data.freshness(now),
    }


@router.get("/boards/{board_id}/overview")
def board_overview(board_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    """RF-113: the kanban board's own "Visão geral" — `sprint_overview`'s shape with calendar
    windows standing in for a sprint's."""
    data = board_data(session, settings, board_id)
    return sprint_views.board_overview(data, now, base_url(settings))


@router.get("/boards/{board_id}/tree")
def board_tree(board_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    data = board_data(session, settings, board_id)
    return {"nodes": sprint_views.board_tree(data, now, base_url(settings)), "freshness": data.freshness(now)}


@router.get("/sprints/{sprint_id}")
def sprint_overview(sprint_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    sprint = sprint_or_404(session, sprint_id)
    data = board_data(session, settings, sprint.board_id)
    return sprint_views.sprint_overview(
        data, sprint, now, committed=repo.load_commitment(session, sprint_id), base_url=base_url(settings)
    )


@router.get("/sprints/{sprint_id}/tree")
def sprint_tree(sprint_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    sprint = sprint_or_404(session, sprint_id)
    data = board_data(session, settings, sprint.board_id)
    return {
        "sprint": sprint_dict(sprint),
        "nodes": sprint_views.sprint_tree(data, sprint, now, base_url(settings)),
        "freshness": data.freshness(now),
    }


@router.get("/sprints/{sprint_id}/timeline")
def sprint_timeline_items(sprint_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    """Every item of the sprint on a time axis: epics, stories, tasks, bugs and subtasks."""
    sprint = sprint_or_404(session, sprint_id)
    data = board_data(session, settings, sprint.board_id)
    return sprint_views.sprint_timeline_view(data, sprint, now, base_url(settings))


@router.get("/sprints/{sprint_id}/risks")
def sprint_risks(
    sprint_id: int,
    session: SessionDep,
    settings: SettingsDep,
    now: Now,
    situation: str | None = None,
    person: str | None = None,
    type: str | None = None,
) -> JSONDict:
    sprint = sprint_or_404(session, sprint_id)
    data = board_data(session, settings, sprint.board_id)
    items = sprint_views.risk_list(
        data,
        now,
        sprint=sprint,
        situations=csv_strs(situation) or None,
        person=person,
        type_name=type,
        base_url=base_url(settings),
    )
    return {"sprint": sprint_dict(sprint), "items": items, "freshness": data.freshness(now)}


@router.get("/boards/{board_id}/risks")
def board_risks(
    board_id: int,
    session: SessionDep,
    settings: SettingsDep,
    now: Now,
    situation: str | None = None,
    person: str | None = None,
    type: str | None = None,
) -> JSONDict:
    data = board_data(session, settings, board_id)
    items = sprint_views.risk_list(
        data,
        now,
        situations=csv_strs(situation) or None,
        person=person,
        type_name=type,
        base_url=base_url(settings),
    )
    return {
        "board": {"id": data.board.id, "name": data.board.name},
        "items": items,
        "freshness": data.freshness(now),
    }


@router.get("/issues/{key}")
def issue(
    key: str, session: SessionDep, settings: SettingsDep, now: Now, board_id: int | None = None
) -> JSONDict:
    data = board_data(session, settings, board_for_issue(session, key, board_id))
    return sprint_views.issue_detail(data, key, now, base_url(settings))


@router.get("/epics/{key}")
def epic(
    key: str, session: SessionDep, settings: SettingsDep, now: Now, board_id: int | None = None
) -> JSONDict:
    data = board_data(session, settings, board_for_issue(session, key, board_id))
    return sprint_views.epic_view(data, key, now, base_url(settings))


@router.get("/flow")
def flow_summary(
    session: SessionDep,
    settings: SettingsDep,
    now: Now,
    board_id: str | None = None,
    person: str | None = None,
    type: str | None = None,
    start: str | None = None,
    end: str | None = None,
) -> JSONDict:
    boards = selected_or(session, settings, csv_ints(board_id))
    until = parse_instant(end, now)
    since = parse_instant(start, until - timedelta(weeks=DEFAULT_WEEKS))
    return flow.flow_view(
        boards, since, until, person=person, type_name=type, committed=committed_lookup(session)
    )


@router.get("/boards/{board_id}/cfd")
def cfd(
    board_id: int,
    session: SessionDep,
    settings: SettingsDep,
    now: Now,
    start: str | None = None,
    end: str | None = None,
) -> JSONDict:
    data = board_data(session, settings, board_id)
    until = parse_instant(end, now)
    return flow.cfd_view(data, parse_instant(start, until - timedelta(weeks=DEFAULT_WEEKS)), until)


@router.get("/boards/{board_id}/cycle-scatter")
def cycle_scatter(
    board_id: int,
    session: SessionDep,
    settings: SettingsDep,
    now: Now,
    start: str | None = None,
    end: str | None = None,
) -> JSONDict:
    data = board_data(session, settings, board_id)
    until = parse_instant(end, now)
    return flow.scatter_view(
        data, parse_instant(start, until - timedelta(weeks=DEFAULT_WEEKS)), until, base_url(settings)
    )


@router.get("/boards/{board_id}/aging")
def aging(board_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    return flow.aging_view(board_data(session, settings, board_id), now)


@router.get("/boards/{board_id}/committed-vs-delivered")
def committed_vs_delivered(
    board_id: int, session: SessionDep, settings: SettingsDep, now: Now, limit: int = 6
) -> JSONDict:
    data = board_data(session, settings, board_id)
    return {"items": flow.committed_vs_delivered(data, now, limit=limit, committed=committed_lookup(session))}


@router.get("/people")
def people(session: SessionDep, scope: str = "selected") -> JSONDict:
    """Everyone, plus the same people grouped by the space (team) they work in.

    Someone who is assigned work in two spaces is listed under both: that repetition is the point,
    it is how a shared person becomes visible as shared.
    """
    rows = session.scalars(select(s.PersonRow))
    items = sorted(
        ({"account_id": r.account_id, "name": r.display_name} for r in rows),
        key=lambda p: p["name"].casefold(),
    )
    board_rows, _ = repo.list_boards(session, selected=None if scope == "all" else True, limit=1000)
    spaces = repo.spaces_of_boards(session, board_rows)
    by_space = repo.people_by_space(session, selected_only=scope != "all")
    groups = []
    for key, members in by_space.items():
        space = spaces.get(key or "")
        groups.append(
            {
                "space": {"key": key, "name": space.label if space else tr("board.no_space")},
                "people": [{"account_id": p.account_id, "name": p.display_name} for p in members],
            }
        )
    groups.sort(key=lambda g: (g["space"]["key"] is None, str(g["space"]["name"]).casefold()))
    placed = {p["account_id"] for g in groups for p in g["people"]}
    return {
        "items": items,
        "spaces": groups,
        "unassigned": [p for p in items if p["account_id"] not in placed],
    }


@router.get("/people/{account_id}")
def person(
    account_id: str,
    session: SessionDep,
    settings: SettingsDep,
    now: Now,
    board_id: str | None = None,
    weeks: int = DEFAULT_WEEKS,
) -> JSONDict:
    boards = selected_or(session, settings, csv_ints(board_id))
    return flow.person_view(
        boards, account_id, now, weeks=weeks, committed=committed_lookup(session), base_url=base_url(settings)
    )
