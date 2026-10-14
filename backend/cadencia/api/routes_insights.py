"""Forecasts, week-over-week changes, data health, search, a person's week and saved views
(RF-72, RF-74, RF-75, RF-78, RF-80, RF-85)."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from cadencia.analytics.changes import board_changes, digest
from cadencia.analytics.forecast import board_forecast, epic_forecast, sprint_forecast
from cadencia.analytics.health import board_health
from cadencia.analytics.serialize import iso
from cadencia.analytics.week import my_week, search
from cadencia.api.deps import (
    JSONDict,
    Now,
    SessionDep,
    SettingsDep,
    base_url,
    board_data,
    board_for_issue,
    csv_ints,
    selected_or,
    sprint_or_404,
)
from cadencia.errors import NotFound
from cadencia.i18n import Msg
from cadencia.store import repo
from cadencia.store import schema as s

router = APIRouter(tags=["insights"])


@router.get("/sprints/{sprint_id}/forecast")
def forecast_sprint(sprint_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    sprint = sprint_or_404(session, sprint_id)
    return sprint_forecast(board_data(session, settings, sprint.board_id), sprint, now)


@router.get("/boards/{board_id}/forecast")
def forecast_board(board_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    return board_forecast(board_data(session, settings, board_id), now)


@router.get("/epics/{key}/forecast")
def forecast_epic(
    key: str, session: SessionDep, settings: SettingsDep, now: Now, board_id: int | None = None
) -> JSONDict:
    data = board_data(session, settings, board_for_issue(session, key, board_id))
    return epic_forecast(data, key, now)


@router.get("/boards/{board_id}/changes")
def changes(
    board_id: int,
    session: SessionDep,
    settings: SettingsDep,
    now: Now,
    since: int | None = None,
    until: int | None = None,
) -> JSONDict:
    """What changed from one checkpoint to another, or from the last one to now (RF-74)."""
    data = board_data(session, settings, board_id)
    return board_changes(session, data, now, since=since, until=until, base_url=base_url(settings))


@router.get("/digest")
def digest_preview(
    session: SessionDep, settings: SettingsDep, now: Now, board_id: str | None = None
) -> JSONDict:
    """The risk digest exactly as it would be sent (RF-73)."""
    boards = selected_or(session, settings, csv_ints(board_id))
    return digest(session, boards, now, base_url(settings))


@router.get("/health-check")
def health_check(
    session: SessionDep, settings: SettingsDep, now: Now, board_id: str | None = None
) -> JSONDict:
    """Jira hygiene problems per board (RF-78)."""
    field_map = repo.load_field_map(session)
    items = [
        board_health(data, field_map, now) for data in selected_or(session, settings, csv_ints(board_id))
    ]
    return {
        "items": items,
        "ok": all(i["ok"] for i in items),
        "problems": sum(1 for i in items for c in i["checks"] if c["severity"] in {"erro", "aviso"}),
    }


@router.get("/search")
def search_everything(session: SessionDep, q: str = "", limit: int = 8) -> JSONDict:
    """What the command palette jumps to (RF-80)."""
    return {"query": q, "items": search(session, q, min(max(limit, 1), 20))}


@router.get("/people/{account_id}/week")
def person_week(
    account_id: str, session: SessionDep, settings: SettingsDep, now: Now, board_id: str | None = None
) -> JSONDict:
    boards = selected_or(session, settings, csv_ints(board_id))
    return my_week(boards, account_id, now, base_url(settings))


# ------------------------------------------------------------ saved views (RF-75)


class ViewBody(BaseModel):
    name: str
    path: str
    query: str = ""
    pinned: bool = False


def _view_dict(row: s.SavedViewRow) -> JSONDict:
    query = f"?{row.query}" if row.query else ""
    return {
        "id": row.id,
        "name": row.name,
        "path": row.path,
        "query": row.query,
        "pinned": row.pinned,
        "url": f"{row.path}{query}",
        "created_at": iso(row.created_at),
    }


@router.get("/views")
def views(session: SessionDep) -> JSONDict:
    return {"items": [_view_dict(r) for r in repo.list_views(session)]}


@router.post("/views", status_code=201)
def create_view(body: ViewBody, session: SessionDep) -> JSONDict:
    return _view_dict(repo.save_view(session, **body.model_dump()))


@router.put("/views/{view_id}")
def update_view(view_id: int, body: ViewBody, session: SessionDep) -> JSONDict:
    return _view_dict(repo.save_view(session, view_id=view_id, **body.model_dump()))


@router.delete("/views/{view_id}", status_code=204)
def delete_view(view_id: int, session: SessionDep) -> None:
    if not repo.delete_view(session, view_id):
        raise NotFound(view_id, Msg("board.not_found.view", view_id=view_id))
