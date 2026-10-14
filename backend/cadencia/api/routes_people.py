"""People: the numbers behind the cards and the tiles, and each person's availability."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from cadencia.analytics.people_overview import people_overview
from cadencia.analytics.person_detail import person_detail
from cadencia.api.deps import (
    JSONDict,
    Now,
    SessionDep,
    SettingsDep,
    base_url,
    committed_lookup,
    csv_ints,
    selected_or,
)
from cadencia.domain.models import BoardProfile
from cadencia.errors import NotFound
from cadencia.i18n import Msg
from cadencia.store import repo

router = APIRouter(tags=["people"])


@router.get("/people/overview")
def overview(session: SessionDep, settings: SettingsDep, now: Now, board_id: str | None = None) -> JSONDict:
    """Workload, deliveries so far, blocks and past deliveries for everyone on the boards in view.

    Declared before ``/people/{account_id}`` (in another router) so "overview" is never read as an id.
    """
    boards = selected_or(session, settings, csv_ints(board_id))
    return {
        "generated_at": now.isoformat(),
        **people_overview(
            boards,
            names=repo.people_names(session),
            absences=repo.absences_for(session),
            availability=repo.availability_map(session),
            committed=committed_lookup(session),
            now=now,
        ),
    }


@router.get("/people/{account_id}/detail")
def detail(
    account_id: str, session: SessionDep, settings: SettingsDep, now: Now, board_id: str | None = None
) -> JSONDict:
    """Everything a person's page shows beyond the card: items, epics, blocks, timeline, capacity, week."""
    boards = selected_or(session, settings, csv_ints(board_id))
    names = repo.people_names(session)
    absences = repo.absences_for(session)
    availability = repo.availability_map(session)
    committed = committed_lookup(session)
    overview_items = people_overview(
        boards, names=names, absences=absences, availability=availability, committed=committed, now=now
    )["items"]
    mine = next((p for p in overview_items if p["account_id"] == account_id), None)
    name = names.get(account_id) or (mine["name"] if mine else None)
    if name is None:
        raise NotFound(account_id, Msg("board.not_found.person"))
    return {
        "generated_at": now.isoformat(),
        **person_detail(
            boards,
            account_id,
            name=name,
            indicators=mine,
            absences=absences,
            availability=availability,
            committed=committed,
            now=now,
            base_url=base_url(settings),
        ),
    }


def _availability(session: SessionDep, settings: SettingsDep, account_id: str) -> JSONDict:
    mine = repo.availability_map(session).get(account_id)
    board = BoardProfile.from_parts(0, [], {}, repo.profile_defaults(settings))
    return {
        "account_id": account_id,
        "hours_per_day": mine.hours_per_day if mine else None,
        "allocation": round((mine.allocation if mine else 1.0) * 100),
        # What a board says unless its own settings differ: the number an empty field falls back to.
        "board_hours_per_day": board.hours_per_day,
        "board_focus_factor": board.focus_factor,
    }


@router.get("/people/{account_id}/availability")
def get_availability(account_id: str, session: SessionDep, settings: SettingsDep) -> JSONDict:
    if account_id not in repo.people_names(session):
        raise NotFound(account_id, Msg("board.not_found.person"))
    return _availability(session, settings, account_id)


class AvailabilityBody(BaseModel):
    #: Empty means "the board's day length".
    hours_per_day: float | None = None
    allocation: int = Field(100, description="Percent of their time given to the tracked boards.")


@router.put("/people/{account_id}/availability")
def put_availability(
    account_id: str, body: AvailabilityBody, session: SessionDep, settings: SettingsDep
) -> JSONDict:
    if account_id not in repo.people_names(session):
        raise NotFound(account_id, Msg("board.not_found.person"))
    repo.save_availability(
        session, account_id, hours_per_day=body.hours_per_day, allocation_pct=body.allocation
    )
    return _availability(session, settings, account_id)
