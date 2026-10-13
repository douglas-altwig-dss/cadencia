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
from cadencia.domain.calendar import sprint_timeline
from cadencia.domain.capacity import Absence, Availability, item_cost_hours, sprint_capacity, sprint_dates
from cadencia.domain.commitment import commitment_report
from cadencia.domain.history import IssueHistory
from cadencia.domain.models import HierarchyLevel, Person
from cadencia.domain.risk import Situation

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
                    e.message
                    for e in (assessment.evidence if assessment else ())
                    if e.situation is Situation.BLOCKED
                ),
                None,
            )
            brief["due_in_days"] = (issue.due_date - today).days if issue.due_date else None
            brief["in_progress"] = profile.is_wip(history.status_at(now))  # type: ignore[arg-type]
        out.append(brief)
    return out


def _timeline(data: BoardData, account_id: str, now: datetime, start: datetime) -> list[dict[str, Any]]:
    """One bar per item, from the moment it started (first in an in-progress status) to done, or to now."""
    profile = data.profile
    bars: list[dict[str, Any]] = []
    for history in data.trackable():
        done_at = history.done_at(now)
        end = done_at or now
        owner = history.assignee_at(end)
        if owner is None or owner.account_id != account_id or history.status_at(now) is None:
            continue
        began = (
            history.first_entry(profile.is_wip)
            if done_at is not None
            else history.current_run_start(profile.is_wip, now) or history.first_entry(profile.is_wip)
        )
        if began is None or end < start:
            continue
        state = "concluido"
        if done_at is None:
            assessment = data.assess([history], now)[history.issue.key]
            blocked = any(e.situation is Situation.BLOCKED for e in assessment.evidence)
            state = (
                "bloqueado"
                if blocked
                else ("andamento" if profile.is_wip(history.status_at(now)) else "aberto")
            )  # type: ignore[arg-type]
        bars.append(
            {
                "key": history.issue.key,
                "summary": history.issue.summary,
                "level": history.issue.hierarchy_level,
                "board": {"id": data.board.id, "name": data.board.name},
                "start": iso(max(began, start)),
                "began": iso(began),
                "end": iso(end),
                "state": state,
            }
        )
    return bars


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
    bars: list[dict[str, Any]] = []
    capacity: list[dict[str, Any]] = []
    start = now - timedelta(weeks=TIMELINE_WEEKS)
    tz = ZoneInfo(boards[0].profile.timezone) if boards else ZoneInfo("UTC")
    for data in boards:
        items.extend(_items(data, account_id, now, base_url))
        bars.extend(_timeline(data, account_id, now, start))
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
    bars.sort(key=lambda b: (b["began"], b["key"]))
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
        "timeline": {"start": iso(start), "end": iso(now), "items": bars},
        "capacity": {"sprints": capacity},
    }
