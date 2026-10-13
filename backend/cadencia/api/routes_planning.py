"""Capacity, absences, greedy allocation and simulation (RF-25 … RF-29)."""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from cadencia.analytics.planning import capacity_view, compute_plan, plan_from_dict, plan_view, sprint_people
from cadencia.analytics.serialize import iso
from cadencia.api.deps import JSONDict, Now, SessionDep, SettingsDep, board_data, sprint_or_404
from cadencia.store import repo

router = APIRouter(tags=["planejamento"])


@router.get("/sprints/{sprint_id}/capacity")
def capacity(sprint_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    sprint = sprint_or_404(session, sprint_id)
    data = board_data(session, settings, sprint.board_id)
    names = repo.people_names(session)
    people = sprint_people(data, sprint, names, now)
    rows = capacity_view(
        data, sprint, people, repo.absences_for(session), availability=repo.availability_map(session)
    )
    return {
        "items": [r.as_dict() for r in rows],
        "total_hours": round(sum(r.hours for r in rows), 2),
        "focus_factor": data.profile.focus_factor,
        "hours_per_day": data.profile.hours_per_day,
    }


@router.get("/absences")
def absences(session: SessionDep, account_id: str | None = None) -> JSONDict:
    names = repo.people_names(session)
    return {
        "items": [
            {
                "id": r.id,
                "account_id": r.account_id,
                "name": names.get(r.account_id, r.account_id),
                "start": iso(r.start_date),
                "end": iso(r.end_date),
                "note": r.note,
            }
            for r in repo.list_absences(session)
            if account_id is None or r.account_id == account_id
        ]
    }


class AbsenceBody(BaseModel):
    account_id: str
    start: date
    end: date
    note: str | None = None


@router.post("/absences", status_code=201)
def add_absence(body: AbsenceBody, session: SessionDep) -> JSONDict:
    row = repo.add_absence(session, body.account_id, body.start, body.end, body.note)
    return {"id": row.id}


@router.delete("/absences/{absence_id}", status_code=204)
def delete_absence(absence_id: int, session: SessionDep) -> None:
    repo.delete_absence(session, absence_id)


@router.get("/sprints/{sprint_id}/allocation")
def allocation(sprint_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    sprint = sprint_or_404(session, sprint_id)
    row = repo.latest_plan(session, sprint_id)
    if row is None:
        return {"plan": None}
    data = board_data(session, settings, sprint.board_id)
    names = repo.people_names(session)
    plan = plan_from_dict(row.result)
    people = sprint_people(data, sprint, names, now)
    capacities = capacity_view(
        data, sprint, people, repo.absences_for(session), availability=repo.availability_map(session)
    )
    return {
        "id": row.id,
        "created_at": iso(row.created_at),
        **plan_view(data, sprint, plan, capacities, names, now),
    }


@router.post("/sprints/{sprint_id}/allocation")
def create_allocation(sprint_id: int, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    sprint = sprint_or_404(session, sprint_id)
    data = board_data(session, settings, sprint.board_id)
    names = repo.people_names(session)
    plan, capacities = compute_plan(
        data,
        sprint,
        repo.absences_for(session),
        names,
        now,
        committed=repo.load_commitment(session, sprint_id),
        availability=repo.availability_map(session),
    )
    plan_id = repo.save_plan(session, sprint_id, dict(plan.parameters), plan.as_dict())
    return {"id": plan_id, **plan_view(data, sprint, plan, capacities, names, now)}


class Simulation(BaseModel):
    focus_factor: float | None = None
    hours_per_day: float | None = None
    max_items_per_person: int | None = None
    capacity: dict[str, float] | None = None
    add_people: list[dict[str, Any]] | None = None
    remove_people: list[str] | None = None


@router.post("/sprints/{sprint_id}/allocation/simulate")
def simulate(
    sprint_id: int, body: Simulation, session: SessionDep, settings: SettingsDep, now: Now
) -> JSONDict:
    """What-if: recompute the theoretical distribution without touching stored data."""
    sprint = sprint_or_404(session, sprint_id)
    data = board_data(session, settings, sprint.board_id)
    names = repo.people_names(session)
    overrides = body.model_dump(exclude_none=True)
    plan, capacities = compute_plan(
        data,
        sprint,
        repo.absences_for(session),
        names,
        now,
        committed=repo.load_commitment(session, sprint_id),
        overrides=overrides or {"simulated": True},
        availability=repo.availability_map(session),
    )
    return {"simulated": True, **plan_view(data, sprint, plan, capacities, names, now)}
