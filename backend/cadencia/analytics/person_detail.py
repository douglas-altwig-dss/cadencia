"""One person's page: their items, epics and blocks, a timeline, capacity per sprint and their week.

This is where the lists live — the cards on the People page and the Home tiles never list an item.
Everything is read across the boards in view, because a person's week is not split by board.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from cadencia.analytics.data import BoardData
from cadencia.analytics.people_overview import CommittedLookup, blocked_days, severity
from cadencia.analytics.serialize import assessment_dict, iso, issue_brief
from cadencia.analytics.sprint import group_row, iso_rows, timeline_rows
from cadencia.domain.calendar import sprint_timeline
from cadencia.domain.capacity import Absence, Availability, item_cost_hours, sprint_capacity, sprint_dates
from cadencia.domain.commitment import commitment_report
from cadencia.domain.history import IssueHistory
from cadencia.domain.models import HierarchyLevel, Person
from cadencia.domain.risk import Situation
from cadencia.i18n import render

RECENT_DAYS = 14
TIMELINE_WEEKS = 8
CAPACITY_SPRINTS = 6
MAX_ITEMS = 200


def epic_of(data: BoardData, issue: Any) -> dict[str, str] | None:
    """The epic an item hangs from, walking up through its parents (a subtask's story, then the epic)."""
    seen: set[str] = set()
    parent = issue.parent_key
    while parent and parent not in seen:
        seen.add(parent)
        found = data.issues.get(parent)
        if found is None:
            return {"key": parent, "summary": parent}
        if found.hierarchy_level >= HierarchyLevel.EPIC:
            return {"key": found.key, "summary": found.summary}
        parent = found.parent_key
    return None


def _owned(data: BoardData, account_id: str, at: datetime) -> list[IssueHistory]:
    return [
        h
        for h in data.trackable()
        if h.status_at(at) is not None and (o := h.assignee_at(at)) is not None and o.account_id == account_id
    ]


def _items(data: BoardData, account_id: str, now: datetime, base_url: str | None) -> list[dict[str, Any]]:
    """Open items, and what was finished in the last two weeks, with what the risk rules say."""
    profile = data.profile
    tz = ZoneInfo(profile.timezone)
    today = now.astimezone(tz).date()
    mine = _owned(data, account_id, now)
    open_ = [h for h in mine if not h.is_done_at(now)]
    assessments = data.assess(open_, now)
    out: list[dict[str, Any]] = []
    for history in mine:
        issue = history.issue
        done_at = history.done_at(now)
        if done_at is not None and now - done_at > timedelta(days=RECENT_DAYS):
            continue
        brief: dict[str, Any] = {
            **issue_brief(issue, base_url),
            "board": {"id": data.board.id, "name": data.board.name},
            "epic": epic_of(data, issue),
            "open": done_at is None,
            "done_at": iso(done_at),
            "estimate_hours": item_cost_hours(history.estimate_at(now), profile)
            if issue.hierarchy_level == HierarchyLevel.STANDARD
            else None,
        }
        if done_at is None:
            assessment = assessments.get(issue.key)
            risk = assessment_dict(assessment)
            blocked = assessment is not None and any(
                e.situation is Situation.BLOCKED for e in assessment.evidence
            )
            brief["risk"] = risk
            brief["blocked"] = blocked
            brief["blocked_days"] = blocked_days(history, profile, now) if blocked else None
            brief["block_reason"] = next(
                (
                    render(e.msg)
                    for e in (assessment.evidence if assessment else ())
                    if e.situation is Situation.BLOCKED
                ),
                None,
            )
            brief["due_in_days"] = (issue.due_date - today).days if issue.due_date else None
            brief["in_progress"] = profile.is_wip(history.status_at(now))  # type: ignore[arg-type]
        out.append(brief)
    return out


def _worked_on(data: BoardData, account_id: str, now: datetime, start: datetime) -> set[str]:
    """The person's items (subtasks included) that were in progress at some point of the period:
    held by them when done, or now, and started — an item never begun has nothing to draw."""
    profile = data.profile
    keys: set[str] = set()
    for history in data.trackable():
        done_at = history.done_at(now)
        end = done_at or now
        owner = history.assignee_at(end)
        if owner is None or owner.account_id != account_id or history.status_at(now) is None:
            continue
        if history.issue.hierarchy_level >= HierarchyLevel.EPIC or end < start:
            continue
        if history.first_entry(profile.is_wip) is None and done_at is None:
            continue
        keys.add(history.issue.key)
    return keys


def _with_ancestors(data: BoardData, keys: set[str]) -> set[str]:
    """The items plus the epics (and initiatives) above them, for grouping — and not anybody
    else's subtasks, which the sprint's own timeline adds."""
    out = set(keys)
    frontier = list(keys)
    while frontier:
        issue = data.issues.get(frontier.pop())
        parent = issue.parent_key if issue else None
        if parent and parent in data.issues and parent not in out:
            out.add(parent)
            frontier.append(parent)
    return out


def _timeline(
    boards: Sequence[BoardData], account_id: str, now: datetime, start: datetime, base_url: str | None
) -> dict[str, Any]:
    """The sprint timeline's own shape over the person's last weeks: the same tree of rows (their
    items under their epics), so the person page draws it with the same component. Someone on more
    than one board gets one group per board.

    An item two of those boards both hold is listed once, under the first of them by name — the
    order the groups are shown in — so it is neither drawn nor counted twice. A board left with
    nothing of its own is not a group."""
    per_board: list[tuple[BoardData, list[dict[str, Any]]]] = []
    counts = {"epicos": 0, "itens": 0, "subtarefas": 0}
    claimed: set[str] = set()
    for data in sorted(boards, key=lambda d: (d.board.name.casefold(), d.board.id)):
        members = _worked_on(data, account_id, now, start) - claimed
        if not members:
            continue
        claimed |= members
        rows, found = timeline_rows(data, _with_ancestors(data, members), members, now, None, base_url)
        per_board.append((data, rows))
        for kind, n in found.items():
            counts[kind] += n
    if len(per_board) == 1:
        nodes = per_board[0][1]
    else:
        nodes = [group_row(f"board:{data.board.id}", data.board.name, rows) for data, rows in per_board]
    return {
        "window": {"start": iso(start), "end": iso(now), "today": iso(now)},
        "counts": {**counts, "total": sum(counts.values())},
        "nodes": [iso_rows(n) for n in nodes],
    }


def _capacity(
    data: BoardData,
    person: Person,
    now: datetime,
    absences: Sequence[Absence],
    availability: dict[str, Availability],
    committed: CommittedLookup | None,
) -> list[dict[str, Any]]:
    """Capacity of each recent sprint against what was committed and delivered, in hours."""
    profile = data.profile
    sprints = data.closed_sprints(now, CAPACITY_SPRINTS)
    current = data.current_sprint(now)
    if current is not None and current.state == "active" and current not in sprints:
        sprints.append(current)
    rows: list[dict[str, Any]] = []
    for sprint in sprints:
        timeline = sprint_timeline(sprint, profile)
        if timeline.start is None or timeline.end is None:
            continue
        report = commitment_report(
            data.sprint_members(sprint.id), sprint, now, committed(sprint.id) if committed else None
        )
        line = next((ln for ln in report.people if ln.owner_id == person.account_id), None)
        if line is None:
            continue
        start, end = sprint_dates(timeline.start, timeline.end, profile.timezone)
        capacity = sprint_capacity([person], start, end, profile, absences, availability=availability)[0]
        rows.append(
            {
                "board": {"id": data.board.id, "name": data.board.name},
                "sprint": {"id": sprint.id, "name": sprint.name, "state": sprint.state},
                "capacity_hours": capacity.hours,
                "absence_days": capacity.absence_days,
                "committed_hours": round(line.committed_estimate * profile.hours_per_point, 2),
                "delivered_hours": round(line.delivered_estimate * profile.hours_per_point, 2),
                "committed": line.committed,
                "delivered": line.delivered + line.added_delivered,
            }
        )
    return rows


def _week(
    items: Sequence[dict[str, Any]], indicators: dict[str, Any] | None, now: datetime, tz: ZoneInfo
) -> dict[str, Any]:
    """How the week is going, in signals: each one a count, never a verdict on the person."""
    today = now.astimezone(tz).date()
    monday = datetime.combine(today - timedelta(days=today.weekday()), datetime.min.time(), tz)
    open_ = [i for i in items if i["open"]]
    finished = [
        i for i in items if not i["open"] and i["done_at"] and datetime.fromisoformat(i["done_at"]) >= monday
    ]
    overdue = [i for i in open_ if i["due_in_days"] is not None and i["due_in_days"] < 0]
    due_soon = [i for i in open_ if i["due_in_days"] is not None and 0 <= i["due_in_days"] <= 7]
    stalled = [
        i for i in open_ if any(e["rule"] == "estagnacao" for e in i["risk"]["evidence"]) and not i["blocked"]
    ]
    blocked = [i for i in open_ if i["blocked"]]
    by_severity: dict[str, int] = defaultdict(int)
    for item in blocked:
        by_severity[severity(item["blocked_days"] or 0)] += 1
    state = indicators["workload"]["state"] if indicators else "sem_capacidade"
    signals = []
    if state == "acima":
        signals.append({"kind": "sobrecarga", "level": "alto", "ratio": indicators["workload"]["ratio"]})  # type: ignore[index]
    if blocked:
        level = "alto" if by_severity["alta"] else "medio"
        signals.append({"kind": "bloqueios", "level": level, "count": len(blocked), **by_severity})
    if overdue:
        signals.append({"kind": "atrasados", "level": "alto", "count": len(overdue)})
    if stalled:
        signals.append({"kind": "parados", "level": "medio", "count": len(stalled)})
    if due_soon:
        signals.append({"kind": "vencendo", "level": "baixo", "count": len(due_soon)})
    status = (
        "dificuldades"
        if any(s["level"] == "alto" for s in signals)
        else ("atencao" if any(s["level"] == "medio" for s in signals) else "ok")
    )
    return {
        "status": status,
        "signals": signals,
        "counts": {
            "open": len(open_),
            "in_progress": sum(1 for i in open_ if i["in_progress"]),
            "finished": len(finished),
            "overdue": len(overdue),
            "due_soon": len(due_soon),
        },
        "week_start": iso(monday),
    }


def person_detail(
    boards: Sequence[BoardData],
    account_id: str,
    *,
    name: str,
    indicators: dict[str, Any] | None,
    absences: Sequence[Absence],
    availability: dict[str, Availability],
    committed: CommittedLookup | None,
    now: datetime,
    base_url: str | None = None,
) -> dict[str, Any]:
    person = Person(account_id, name)
    items: list[dict[str, Any]] = []
    capacity: list[dict[str, Any]] = []
    start = now - timedelta(weeks=TIMELINE_WEEKS)
    tz = ZoneInfo(boards[0].profile.timezone) if boards else ZoneInfo("UTC")
    for data in boards:
        items.extend(_items(data, account_id, now, base_url))
        capacity.extend(_capacity(data, person, now, absences, availability, committed))
        if any(i["board"]["id"] == data.board.id for i in items):
            tz = ZoneInfo(data.profile.timezone)
    items.sort(
        key=lambda i: (
            not i["open"],
            -(i["risk"]["severity"] if i["open"] else 0),
            i["due_in_days"] if i["open"] and i["due_in_days"] is not None else 999,
            "" if i["open"] else "~" + (i["done_at"] or ""),
            i["key"],
        )
    )
    epics: dict[str, dict[str, Any]] = {}
    for item in items:
        epic = item["epic"]
        if epic is None:
            continue
        entry = epics.setdefault(
            epic["key"], {**epic, "open": 0, "finished": 0, "blocked": 0, "boards": set()}
        )
        entry["boards"].add(item["board"]["name"])
        if item["open"]:
            entry["open"] += 1
            entry["blocked"] += bool(item["blocked"])
        else:
            entry["finished"] += 1
    blocks = [i for i in items if i["open"] and i["blocked"]]
    blocks.sort(key=lambda i: -(i["blocked_days"] or 0))
    return {
        "person": {"account_id": account_id, "name": name},
        "indicators": indicators,
        "week": _week(items, indicators, now, tz),
        "items": items[:MAX_ITEMS],
        "epics": sorted(
            ({**e, "boards": sorted(e["boards"])} for e in epics.values()),
            key=lambda e: (-e["open"], e["key"]),
        ),
        "blocks": blocks,
        "timeline": _timeline(boards, account_id, now, start, base_url),
        "capacity": {"sprints": capacity},
    }
