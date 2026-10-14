"""Capacity, greedy allocation, comparison with reality and what-if simulation (RF-25 … RF-29)."""

from __future__ import annotations

from collections import Counter
from collections.abc import Collection, Iterable, Mapping
from datetime import datetime
from typing import Any

from cadencia.analytics.data import BoardData
from cadencia.domain.allocation import (
    DISCLAIMER,
    AllocationItem,
    AllocationPlan,
    Assignment,
    Candidate,
    allocate,
    compare_plan,
)
from cadencia.domain.calendar import sprint_timeline
from cadencia.domain.capacity import (
    Absence,
    Availability,
    PersonCapacity,
    item_cost_hours,
    sprint_capacity,
    sprint_dates,
)
from cadencia.domain.models import HierarchyLevel, Person, Sprint
from cadencia.i18n import Msg, localize


def sprint_people(data: BoardData, sprint: Sprint, names: Mapping[str, str], now: datetime) -> list[Person]:
    if data.profile.members:
        return [Person(a, names.get(a, a)) for a in data.profile.members]
    seen: dict[str, str] = {}
    reference = data.reference_for(sprint, now)
    for history in data.sprint_members(sprint.id):
        for at in (sprint.start or reference, reference):
            owner = history.assignee_at(at)
            if owner:
                seen[owner.account_id] = names.get(owner.account_id, owner.display_name)
    return sorted((Person(a, n) for a, n in seen.items()), key=lambda p: p.display_name.casefold())


def capacity_view(
    data: BoardData,
    sprint: Sprint,
    people: Iterable[Person],
    absences: Iterable[Absence],
    *,
    focus_factor: float | None = None,
    hours_per_day: float | None = None,
    availability: Mapping[str, Availability] | None = None,
) -> list[PersonCapacity]:
    timeline = sprint_timeline(sprint, data.profile)
    if timeline.start is None or timeline.end is None:
        return []
    start, end = sprint_dates(timeline.start, timeline.end, data.profile.timezone)
    return sprint_capacity(
        list(people),
        start,
        end,
        data.profile,
        absences,
        focus_factor=focus_factor,
        hours_per_day=hours_per_day,
        availability=availability,
    )


def history_counts(data: BoardData, until: datetime) -> Counter[tuple[str, str, str]]:
    counts: Counter[tuple[str, str, str]] = Counter()
    for history in data.work_items():
        done = history.done_at(until)
        if done is None:
            continue
        owner = history.assignee_at(done)
        if owner is None:
            continue
        for component in history.issue.components or ("",):
            counts[(owner.account_id, history.issue.type_name, component)] += 1
    return counts


def plan_items(
    data: BoardData, sprint: Sprint, committed: Collection[str] | None, now: datetime
) -> list[AllocationItem]:
    at = sprint.start if sprint.start and sprint.start <= now else now
    if committed:
        keys = [k for k in committed if k in data.histories]
    else:
        keys = [
            h.issue.key
            for h in data.sprint_members(sprint.id, at)
            if h.issue.hierarchy_level == HierarchyLevel.STANDARD
        ]
    items = []
    for key in keys:
        history = data.histories[key]
        issue = history.issue
        items.append(
            AllocationItem(
                key=key,
                rank=issue.rank,
                cost_hours=item_cost_hours(history.estimate_at(at), data.profile),
                type_name=issue.type_name,
                components=issue.components,
                labels=issue.labels,
                blocked_by=issue.blocked_by,
            )
        )
    return items


def compute_plan(
    data: BoardData,
    sprint: Sprint,
    absences: Iterable[Absence],
    names: Mapping[str, str],
    now: datetime,
    *,
    committed: Collection[str] | None = None,
    overrides: Mapping[str, Any] | None = None,
    availability: Mapping[str, Availability] | None = None,
) -> tuple[AllocationPlan, list[PersonCapacity]]:
    """Greedy plan; ``overrides`` enable what-if simulation without touching stored data (RF-29)."""
    overrides = overrides or {}
    people = sprint_people(data, sprint, names, now)
    removed = set(overrides.get("remove_people") or [])
    people = [p for p in people if p.account_id not in removed]
    capacities = capacity_view(
        data,
        sprint,
        people,
        absences,
        focus_factor=overrides.get("focus_factor"),
        hours_per_day=overrides.get("hours_per_day"),
        availability=availability,
    )
    manual = {str(k): float(v) for k, v in (overrides.get("capacity") or {}).items()}
    candidates = [
        Candidate(c.account_id, c.display_name, manual.get(c.account_id, c.hours)) for c in capacities
    ]
    for extra in overrides.get("add_people") or []:
        candidates.append(
            Candidate(
                str(extra["account_id"]),
                str(extra.get("display_name") or extra["account_id"]),
                float(extra["capacity_hours"]),
            )
        )
    plan = allocate(
        plan_items(data, sprint, committed, now),
        candidates,
        explicit_affinity=data.profile.affinity,
        history_counts=history_counts(data, sprint.start or now),
        max_items_per_person=int(overrides.get("max_items_per_person") or data.profile.max_items_per_person),
        parameters={
            "focus_factor": overrides.get("focus_factor", data.profile.focus_factor),
            "hours_per_day": overrides.get("hours_per_day", data.profile.hours_per_day),
            "hours_per_point": data.profile.hours_per_point,
            "unestimated_item_hours": data.profile.unestimated_item_hours,
            "simulated": bool(overrides),
        },
    )
    return plan, capacities


def plan_from_dict(payload: Mapping[str, Any]) -> AllocationPlan:
    return AllocationPlan(
        assignments=tuple(
            Assignment(a["key"], a.get("account_id"), a.get("rule", ""), float(a.get("cost_hours", 0)))
            for a in payload.get("assignments", [])
        ),
        capacity={k: float(v) for k, v in (payload.get("capacity") or {}).items()},
        load={k: float(v) for k, v in (payload.get("load") or {}).items()},
        parameters=dict(payload.get("parameters") or {}),
        # `$msg` records since messages exist; plain pt-BR strings in plans stored before.
        warnings=tuple(Msg.from_json(w) if Msg.is_json(w) else str(w) for w in payload.get("warnings") or ()),
    )


def plan_view(
    data: BoardData,
    sprint: Sprint,
    plan: AllocationPlan,
    capacities: Iterable[PersonCapacity],
    names: Mapping[str, str],
    now: datetime,
) -> dict[str, Any]:
    reference = data.reference_for(sprint, now)
    actual: dict[str, str | None] = {}
    rows = []
    for assignment in plan.assignments:
        history = data.histories.get(assignment.key)
        owner = history.assignee_at(reference) if history else None
        actual[assignment.key] = owner.account_id if owner else None
        rows.append(
            {
                "key": assignment.key,
                "summary": history.issue.summary if history else assignment.key,
                "cost_hours": assignment.cost_hours,
                "rule": assignment.rule,
                "planned_id": assignment.account_id,
                "planned": names.get(assignment.account_id or "", assignment.account_id),
                "actual_id": owner.account_id if owner else None,
                "actual": owner.display_name if owner else None,
                "match": bool(assignment.account_id and owner and owner.account_id == assignment.account_id),
            }
        )
    all_names = {**names, **{c.account_id: c.display_name for c in capacities}}
    comparison = compare_plan(
        plan,
        actual,
        all_names,
        overload_threshold=data.profile.overload_threshold,
        idle_threshold=data.profile.idle_threshold,
    )
    return localize(
        {
            "plan": plan.as_dict(),
            "capacity": [c.as_dict() for c in capacities],
            "items": rows,
            "comparison": comparison.as_dict(),
            "disclaimer": DISCLAIMER,
        }
    )
