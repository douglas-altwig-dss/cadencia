"""FastAPI dependencies. Views are sync functions (run in the threadpool) reading the store only."""

from __future__ import annotations

import re
from collections.abc import Callable, Collection, Iterator
from datetime import UTC, date, datetime, time
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session, sessionmaker

from cadencia.analytics.data import BoardData, load_board
from cadencia.config import Settings
from cadencia.config_store import effective_settings
from cadencia.domain.models import Sprint
from cadencia.errors import NotFound
from cadencia.i18n import tr
from cadencia.store import repo
from cadencia.store.db import session_scope


def sessions_dep(request: Request) -> sessionmaker[Session]:
    return request.app.state.sessions


def session_dep(request: Request) -> Iterator[Session]:
    with session_scope(request.app.state.sessions) as session:
        yield session


SessionsDep = Annotated[sessionmaker[Session], Depends(sessions_dep)]
# scope="function": commit before the response is sent, so a follow-up request (e.g. downloading
# the deck just generated) always sees the write.
SessionDep = Annotated[Session, Depends(session_dep, scope="function")]


def settings_dep(request: Request, session: SessionDep) -> Settings:
    """The effective settings for this request: the environment (``app.state.settings``) with the
    values saved in the app laid over it (docs/config-store.md). It reads through the request's
    own session, so a request that also saves configuration sees what it saved."""
    return effective_settings(request.app.state.settings, session)


def clock() -> datetime:
    """Request time, to the minute: every view a page loads at once then asks about the same
    instant, so they share the board's memoised risk context instead of each building its own."""
    return datetime.now(UTC).replace(second=0, microsecond=0)


SettingsDep = Annotated[Settings, Depends(settings_dep)]
Now = Annotated[datetime, Depends(clock)]


def author_of(request: Request, fallback: str | None = None) -> str | None:
    """Who is acting: the user nginx signed in (``X-Remote-User``), else what the browser says.

    The header is only trustworthy behind the token check, which is where it comes from: nginx sets
    it after basic auth, and a direct caller would need the API token to reach this far.
    """
    signed_in = (request.headers.get("x-remote-user") or "").strip()
    return signed_in or ((fallback or "").strip() or None)


def not_found(cause: str, message: str) -> HTTPException:
    return HTTPException(status_code=404, detail={"cause": cause, "message": message})


_PLAIN_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def stored_file(root: Path, *parts: str) -> Path:
    """A file under ``root`` named by request path parts, or 400/404.

    The router hands over ``..`` as a perfectly good path parameter, so every part must be a plain
    name (no separator, no leading dot) and the resolved file must still sit inside ``root``, which
    also catches a symlink pointing out of it.
    """
    for part in parts:
        if not _PLAIN_NAME.match(part):
            raise HTTPException(400, detail={"cause": tr("http.invalid_name.cause"), "message": part})
    path = root.joinpath(*parts)
    if not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
        raise not_found(tr("http.file_not_found.cause"), parts[-1])
    return path


def board_data(session: Session, settings: Settings, board_id: int) -> BoardData:
    try:
        return load_board(session, board_id, repo.profile_defaults(settings), settings.history_days)
    except NotFound:
        raise not_found(
            tr("http.board_not_found.cause"), tr("http.board_not_found.message", board_id=board_id)
        ) from None


def sprint_or_404(session: Session, sprint_id: int) -> Sprint:
    sprint = repo.get_sprint(session, sprint_id)
    if sprint is None:
        raise not_found(
            tr("http.sprint_not_found.cause"), tr("http.sprint_not_found.message", sprint_id=sprint_id)
        )
    return sprint


def board_for_issue(session: Session, key: str, board_id: int | None) -> int:
    if board_id is not None:
        return board_id
    from sqlalchemy import select

    from cadencia.store import schema as s

    found = session.scalar(select(s.IssueBoardRow.board_id).where(s.IssueBoardRow.issue_key == key).limit(1))
    if found is None:
        raise not_found(tr("http.issue_not_found.cause"), tr("http.issue_not_found.message", key=key))
    return int(found)


def committed_lookup(session: Session) -> Callable[[int], Collection[str] | None]:
    return lambda sprint_id: repo.load_commitment(session, sprint_id)


def base_url(settings: Settings) -> str | None:
    return settings.jira_base_url or None


def parse_instant(value: str | None, default: datetime) -> datetime:
    if not value:
        return default
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        try:
            parsed = datetime.combine(date.fromisoformat(value), time(23, 59, 59))
        except ValueError:
            raise HTTPException(
                400,
                detail={
                    "cause": tr("http.invalid_date.cause"),
                    "message": tr("http.invalid_date.message", value=repr(value)),
                },
            ) from None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def csv_ints(value: str | None) -> list[int]:
    if not value:
        return []
    try:
        return [int(v) for v in value.split(",") if v.strip()]
    except ValueError:
        raise HTTPException(400, detail={"cause": tr("http.invalid_param.cause"), "message": value}) from None


def csv_strs(value: str | None) -> list[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def selected_or(session: Session, settings: Settings, ids: list[int]) -> list[BoardData]:
    wanted = ids or [b.id for b in repo.selected_boards(session)]
    return [board_data(session, settings, b) for b in wanted]


JSONDict = dict[str, Any]
