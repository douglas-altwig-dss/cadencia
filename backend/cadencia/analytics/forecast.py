"""Forecast views (RF-72): the Monte Carlo answer for a sprint and for an epic."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from cadencia.analytics.data import BoardData
from cadencia.domain.calendar import business_days, sprint_timeline
from cadencia.domain.forecast import daily_throughput, monte_carlo
from cadencia.domain.models import HierarchyLevel, Sprint
from cadencia.errors import NotFound


def _sample(data: BoardData, now: datetime) -> list[int]:
    # The whole board's pace, not one sprint's: a sprint is too short a sample, and the team does
    # not change speed at a sprint boundary.
    return daily_throughput(data.work_items(), now, tz=data.profile.timezone, holidays=data.profile.holidays)


def sprint_forecast(data: BoardData, sprint: Sprint, now: datetime) -> dict[str, Any]:
    reference = data.reference_for(sprint, now)
    timeline = sprint_timeline(sprint, data.profile)
    members = [
        h
        for h in data.sprint_members(sprint.id)
        if h.issue.hierarchy_level == HierarchyLevel.STANDARD and h.in_sprint_at(sprint.id, reference)
    ]
    remaining = [h for h in members if not h.is_done_at(reference)]
    horizon = None
    if timeline.end is not None and timeline.end > reference:
        # Today counts only if the working day is not over; business_days handles that overlap.
        horizon = business_days(
            reference, timeline.end, tz=data.profile.timezone, holidays=data.profile.holidays
        )
    start = reference.astimezone(_zone(data)).date()
    result = monte_carlo(
        _sample(data, reference), len(remaining), start, horizon_days=horizon, holidays=data.profile.holidays
    )
    return {
        "scope": "sprint",
        "sprint": {"id": sprint.id, "name": sprint.name, "state": sprint.state},
        "end": timeline.end.isoformat() if timeline.end else None,
        "closed": sprint.state == "closed",
        "forecast": result.as_dict(),
        "remaining_keys": sorted(h.issue.key for h in remaining),
    }


def epic_forecast(data: BoardData, epic_key: str, now: datetime) -> dict[str, Any]:
    if epic_key not in data.issues:
        raise NotFound(epic_key, f"O épico {epic_key} não está neste board.")
    keys, frontier = {epic_key}, [epic_key]
    while frontier:
        parent = frontier.pop()
        for history in data.histories.values():
            if history.issue.parent_key == parent and history.issue.key not in keys:
                keys.add(history.issue.key)
                frontier.append(history.issue.key)
    work = [
        data.histories[k]
        for k in keys
        if k != epic_key and data.issues[k].hierarchy_level == HierarchyLevel.STANDARD
    ]
    remaining = [h for h in work if h.status_at(now) is not None and not h.is_done_at(now)]
    start = now.astimezone(_zone(data)).date()
    result = monte_carlo(_sample(data, now), len(remaining), start, holidays=data.profile.holidays)
    return {
        "scope": "epic",
        "epic": {"key": epic_key, "summary": data.issues[epic_key].summary},
        "forecast": result.as_dict(),
        "remaining_keys": sorted(h.issue.key for h in remaining),
        # The epic competes with everything else on the board for the same people, so its forecast
        # at the board's full pace is optimistic by construction; say so rather than let it pass.
        "caveat": (
            "Usa o ritmo do board inteiro; se o épico divide o time com outras frentes, "
            "o prazo real tende a ser maior."
        ),
    }


def board_forecast(data: BoardData, now: datetime) -> dict[str, Any]:
    """RF-113: the board's own pace against everything open on it right now — a kanban board has
    no sprint to ask "will we finish in time", only "at this rate, when does today's queue clear".
    """
    remaining = [h for h in data.open_items(now) if h.issue.hierarchy_level == HierarchyLevel.STANDARD]
    start = now.astimezone(_zone(data)).date()
    result = monte_carlo(_sample(data, now), len(remaining), start, holidays=data.profile.holidays)
    return {
        "scope": "board",
        "forecast": result.as_dict(),
        "remaining_keys": sorted(h.issue.key for h in remaining),
    }


def _zone(data: BoardData) -> ZoneInfo:
    return ZoneInfo(data.profile.timezone)
