"""Connection, discovery, board selection and configuration, collection status (RF-01 … RF-05)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from cadencia import __version__
from cadencia.analytics.serialize import iso
from cadencia.api.deps import JSONDict, SessionDep, SessionsDep, SettingsDep, not_found
from cadencia.collector.service import (
    COLLECT_LEASE,
    LEASE_TTL,
    run_collection,
    run_connection_test,
    run_discovery,
)
from cadencia.errors import NotFound
from cadencia.i18n import stored_text, tr
from cadencia.jira.errors import JiraError
from cadencia.logging import new_run_id
from cadencia.store import repo
from cadencia.store import schema as s
from cadencia.store.db import session_scope

router = APIRouter(tags=["settings"])


def _require_jira(settings: Any) -> None:
    if not settings.jira_configured():
        raise HTTPException(
            400,
            detail={
                "cause": tr("collect.jira_not_configured.cause"),
                "action": tr("collect.jira_not_configured.action"),
            },
        )


@router.get("/health")
def health(request: Request, settings: SettingsDep, session: SessionDep) -> JSONDict:
    # Public so a container health check needs no credential, which is why the instance address is
    # only told to a caller that sent the token.
    authenticated = request.scope.get("state", {}).get("authenticated", True)
    return {
        "status": "ok",
        "version": __version__,
        "database": session.get_bind().dialect.name,
        "jira_configured": settings.jira_configured(),
        "jira_base_url": (settings.jira_base_url or None) if authenticated else None,
        "timezone": settings.timezone,
    }


@router.post("/connection/test")
async def connection_test(settings: SettingsDep, sessions: SessionsDep) -> JSONDict:
    _require_jira(settings)
    try:
        return await run_connection_test(settings, sessions)
    except JiraError as exc:
        return {"ok": False, "error": exc.as_dict()}


@router.post("/discovery")
async def discovery(settings: SettingsDep, sessions: SessionsDep) -> JSONDict:
    _require_jira(settings)
    return await run_discovery(settings, sessions)


def _no_space() -> JSONDict:
    return {"key": None, "name": tr("collect.no_space")}


def _error_text(record: dict[str, Any] | None, part: str, legacy: str | None) -> str | None:
    """One part of a stored failure, in the reader's language; rows from before the records
    existed (and a message that was never a key, such as an exception's own words) show the
    stored text."""
    return stored_text((record or {}).get(part), legacy)


def _board_dict(row: s.BoardRow) -> JSONDict:
    return {
        "id": row.id,
        "name": row.name,
        "type": row.type,
        "space_key": row.space_key,
        "space_name": row.space_name,
        "selected": row.selected,
        "last_success_at": iso(row.last_success_at),
        "last_error": _error_text(row.last_error_i18n, "message", row.last_error),
    }


def _group_by_space(session: Session, rows: list[s.BoardRow]) -> list[JSONDict]:
    """Boards under the space (team) that owns them, spaces alphabetical, boards inside each."""
    spaces = repo.spaces_of_boards(session, rows)
    grouped: dict[str | None, list[s.BoardRow]] = {}
    for row in rows:
        grouped.setdefault(row.space_key or None, []).append(row)
    out = []
    for key, boards in grouped.items():
        space = spaces.get(key or "")
        out.append(
            {
                "space": {"key": key, "name": space.label} if space else _no_space(),
                "boards": [_board_dict(b) for b in sorted(boards, key=lambda b: b.name.casefold())],
            }
        )
    out.sort(key=lambda g: (g["space"]["key"] is None, str(g["space"]["name"]).casefold()))
    return out


@router.get("/boards")
def boards(
    session: SessionDep,
    q: str | None = None,
    selected: bool | None = None,
    page: int = 1,
    page_size: int = 25,
) -> JSONDict:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    rows, total = repo.list_boards(
        session, query=q, selected=selected, offset=(page - 1) * page_size, limit=page_size
    )
    return {
        "items": [_board_dict(r) for r in rows],
        "spaces": _group_by_space(session, rows),
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/spaces")
def spaces(session: SessionDep, selected: bool | None = None) -> JSONDict:
    """The teams: every known space with the boards under it (RF-01)."""
    rows, _ = repo.list_boards(session, selected=selected, limit=1000)
    groups = _group_by_space(session, rows)
    known = {g["space"]["key"] for g in groups}
    for row in repo.list_spaces(session):  # spaces with no board yet still exist as teams
        if row.key not in known:
            groups.append({"space": {"key": row.key, "name": row.name}, "boards": []})
    groups.sort(key=lambda g: (g["space"]["key"] is None, str(g["space"]["name"]).casefold()))
    return {"items": groups, "total": len(groups)}


class Selection(BaseModel):
    board_ids: list[int]


@router.put("/boards/selection")
def select_boards(body: Selection, session: SessionDep) -> JSONDict:
    repo.set_selected_boards(session, body.board_ids)
    session.flush()
    return {"selected": [b.id for b in repo.selected_boards(session)]}


@router.get("/boards/{board_id}")
def board_detail(board_id: int, session: SessionDep, settings: SettingsDep) -> JSONDict:
    row = session.get(s.BoardRow, board_id)
    if row is None:
        raise not_found(tr("collect.board_not_found"), tr("collect.board_detail", board=board_id))
    profile = repo.board_profile(session, board_id, repo.profile_defaults(settings))
    return {
        **_board_dict(row),
        "columns": row.columns,
        "settings": profile.settings_dict(),
        "overridden": sorted((row.settings or {}).keys()),
    }


@router.put("/boards/{board_id}/settings")
def board_settings(
    board_id: int, body: dict[str, Any], session: SessionDep, settings: SettingsDep
) -> JSONDict:
    try:
        profile = repo.update_board_settings(session, board_id, body, repo.profile_defaults(settings))
    except NotFound:
        raise not_found(tr("collect.board_not_found"), tr("collect.board_detail", board=board_id)) from None
    return {"settings": profile.settings_dict()}


@router.get("/fields")
def fields(session: SessionDep) -> JSONDict:
    effective = repo.load_field_map(session)
    return {
        "discovered": repo.discovered_field_map(session).as_dict(),
        "overrides": repo.field_overrides(session),
        "effective": effective.as_dict(),
        "missing": effective.missing(),
    }


class FieldOverrides(BaseModel):
    """Manual custom-field ids; an empty value keeps what discovery found. Unknown keys are ignored."""

    story_points: list[str] | None = None
    sprint: str | None = None
    epic_link: str | None = None
    flagged: str | None = None
    rank: str | None = None


@router.put("/fields/overrides")
def field_overrides(body: FieldOverrides, session: SessionDep) -> JSONDict:
    repo.save_field_overrides(session, body.model_dump(exclude_unset=True))
    return fields(session)


def _run_dict(last: s.BoardRunRow | None) -> JSONDict | None:
    if last is None:
        return None
    return {
        "run_id": last.run_id,
        "status": last.status,
        "started_at": iso(last.started_at),
        "finished_at": iso(last.finished_at),
        "counters": last.counters,
        "error": _error_text(last.error_i18n, "message", last.error),
        "cause": _error_text(last.error_i18n, "cause", last.cause),
        "action": _error_text(last.error_i18n, "action", last.action),
    }


def _space_summary(group: JSONDict, boards: list[JSONDict]) -> JSONDict:
    """A space row aggregates its boards: oldest successful collection wins, so the row shows the
    weakest link rather than hiding a board that stopped being collected."""
    successes = [b["last_success_at"] for b in boards]
    fulls = [b["last_full_at"] for b in boards]
    statuses = {(b["last_run"] or {}).get("status") for b in boards}
    if "failed" in statuses:
        rollup = "failed"
    elif "running" in statuses:
        rollup = "running"
    elif statuses and statuses <= {"success", "empty"}:
        rollup = "success"
    else:
        rollup = "partial" if statuses - {None} else None
    return {
        "entity": "space",
        "id": f"space:{group['space']['key'] or ''}",
        "name": group["space"]["name"],
        "space": group["space"],
        "board": None,
        "boards": len(boards),
        "last_success_at": min(successes) if successes and all(successes) else None,
        "last_full_at": min(fulls) if fulls and all(fulls) else None,
        "last_run": {"status": rollup} if rollup else None,
    }


@router.get("/status")
def status(session: SessionDep, settings: SettingsDep) -> JSONDict:
    runs = repo.latest_runs(session, 10)
    rows, _ = repo.list_boards(session, selected=True, limit=500)
    by_id = {row.id: row for row in rows}
    boards_status = []
    entities: list[JSONDict] = []
    for group in _group_by_space(session, rows):
        board_rows = []
        for board in group["boards"]:
            row = by_id[board["id"]]
            entry = {
                "board": board,
                "last_success_at": iso(row.last_success_at),
                "last_full_at": iso(row.last_full_at),
                "last_run": _run_dict(repo.last_board_run(session, row.id)),
            }
            boards_status.append(entry)
            board_rows.append(
                {
                    "entity": "board",
                    "id": f"board:{row.id}",
                    "name": row.name,
                    "space": group["space"],
                    **entry,
                }
            )
        entities.append(_space_summary(group, board_rows))
        entities.extend(board_rows)
    return {
        "jira_configured": settings.jira_configured(),
        # The lease, not a lock in this process: a collection the scheduler started counts too.
        "collecting": repo.lease_holder(session, COLLECT_LEASE) is not None,
        "current": _current_run(session),
        "runs": [
            {
                "id": r.id,
                "mode": r.mode,
                "status": r.status,
                "started_at": iso(r.started_at),
                "finished_at": iso(r.finished_at),
                "counters": r.counters,
                "error": stored_text(r.error_i18n, r.error),
            }
            for r in runs
        ],
        "boards": boards_status,
        "entities": entities,
    }


def _current_run(session: Session) -> JSONDict | None:
    """RF-82: the collection holding the lease, board by board, with an ETA from past runs."""
    holder = repo.lease_holder(session, COLLECT_LEASE)
    if holder is None:
        return None
    run = session.get(s.CollectorRunRow, holder)
    now = datetime.now(UTC)
    names = {b.id: b.name for b in repo.selected_boards(session)}
    boards = []
    for row in repo.board_runs(session, holder):
        counters = row.counters or {}
        elapsed = (now - row.started_at).total_seconds()
        typical = repo.typical_duration(session, row.board_id, counters.get("full"))
        boards.append(
            {
                "board_id": row.board_id,
                "name": names.get(row.board_id, str(row.board_id)),
                "status": row.status,
                "phase": counters.get("phase"),
                "done": counters.get("done"),
                "total": counters.get("total"),
                "started_at": iso(row.started_at),
                "eta_seconds": max(0, round(typical - elapsed))
                if typical and row.status == "running"
                else None,
            }
        )
    boards.sort(key=lambda b: str(b["name"]).casefold())
    return {
        "run_id": holder,
        "mode": run.mode if run else None,
        "started_at": iso(run.started_at) if run else None,
        "boards": boards,
        "cancel_requested": repo.cancel_requested(session, holder),
    }


@router.post("/collect/cancel", status_code=202)
def cancel_collection(session: SessionDep) -> JSONDict:
    """Stop the running collection at its next step; what was already written stays consistent."""
    holder = repo.lease_holder(session, COLLECT_LEASE)
    if holder is None:
        raise HTTPException(409, detail={"cause": tr("collect.nothing_running")})
    repo.request_cancel(session, holder)
    return {"cancelling": holder}


class CollectBody(BaseModel):
    mode: Literal["incremental", "full"] = "incremental"
    board_ids: list[int] | None = None


@router.post("/collect", status_code=202)
async def collect(
    body: CollectBody, background: BackgroundTasks, settings: SettingsDep, sessions: SessionsDep
) -> JSONDict:
    _require_jira(settings)
    # Taken before answering, so the very next /status already says "collecting"; the background
    # job then runs under the same holder, which the lease accepts as a renewal.
    run_id = new_run_id()
    with session_scope(sessions) as session:
        taken = repo.acquire_lease(session, COLLECT_LEASE, run_id, LEASE_TTL)
    if not taken:
        raise HTTPException(
            409,
            detail={
                "cause": tr("collect.already_running.cause"),
                "action": tr("collect.already_running.action"),
            },
        )

    async def job() -> None:
        try:
            await run_collection(settings, sessions, mode=body.mode, board_ids=body.board_ids, run_id=run_id)
        finally:  # collect() releases it too; this covers a failure before it got that far
            with session_scope(sessions) as session:
                repo.release_lease(session, COLLECT_LEASE, run_id)

    background.add_task(job)
    return {"accepted": True, "mode": body.mode, "run_id": run_id}
