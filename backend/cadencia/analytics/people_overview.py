"""Per-person indicators for the current sprint: workload, deliveries so far, blocks, and what was
delivered in the last sprints — aggregated across the boards in view.

Everything here is a number. The cards on the People page and the tiles on the Home page draw from
it, and neither lists a person's items: an item list is what the person's own page is for. A person
who works on two boards is *one* person here — load and deliveries add up, capacity is counted once.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from cadencia.analytics.data import BoardData
from cadencia.domain.calendar import sprint_timeline
from cadencia.domain.capacity import Absence, Availability, item_cost_hours, sprint_capacity, sprint_dates
from cadencia.domain.commitment import commitment_report, is_work_item
from cadencia.domain.history import IssueHistory
from cadencia.domain.models import BoardProfile, ChangeField, Person
from cadencia.domain.risk import Situation

#: A block is "low" under 2 days, "medium" up to 5 days, "high" beyond that.
BLOCK_DAYS = (2, 5)
PAST_SPRINTS = 6
NO_OWNER = "__sem_responsavel__"

CommittedLookup = Callable[[int], Collection[str] | None]


@dataclass
class _Window:
    """The stretch a board's numbers are about: the active sprint, or this week when there is none."""

    kind: str  # "sprint" | "semana"
    today: date
    ends_on: date
    profile: BoardProfile
    #: The sprint is still open in Jira but its end date has passed; the horizon then is the week.
    overdue: bool = False


@dataclass
class _OnBoard:
    """What one board says about one person."""

    board_id: int
    board_name: str
    space_key: str | None
    space_name: str | None
    hours: float = 0.0
    open_items: int = 0
    unestimated: int = 0
    #: Every item they hold in the sprint (or the week), subtasks included, open or done.
    activity: int = 0
    delivered: int = 0
    committed: int | None = None
    blocked_days: list[int] = field(default_factory=list)
    #: The last closed sprints, oldest first; None where the person had nothing in that sprint.
    past: list[dict[str, Any] | None] = field(default_factory=list)


def blocked_days(history: IssueHistory, profile: BoardProfile, now: datetime) -> int:
    """How long an item has been blocked, from the earliest sign that still holds: the flag, or the
    stretch in a blocking status. A block that is only a link has no start of its own, so it falls
    back to the last status change."""
    starts: list[datetime] = []
    if history.flagged_at(now):
        flags = history.transitions_between(
            history.issue.created - timedelta(seconds=1), now, ChangeField.FLAGGED
        )
        raised = [t.at for t in flags if (t.to_value or "").strip()]
        starts.append(raised[-1] if raised else history.issue.created)
    status = history.status_at(now)
    if status is not None and profile.is_blocked_status(status):
        run = history.current_run_start(profile.is_blocked_status, now)
        if run is not None:
            starts.append(run)
    since = min(starts) if starts else history.last_status_change_at(now)
    return max((now - since).days, 0)


def severity(days: int) -> str:
    low, medium = BLOCK_DAYS
    return "baixa" if days < low else "media" if days <= medium else "alta"


def _week_end(today: date) -> date:
    """This week's Friday, or next week's on a weekend (when today has no working day left)."""
    return today + timedelta(days=(4 - today.weekday()) % 7)


def _window(data: BoardData, now: datetime) -> tuple[_Window, Any]:
    profile = data.profile
    today = now.astimezone(ZoneInfo(profile.timezone)).date()
    sprint = data.current_sprint(now)
    if sprint is not None and sprint.state == "active" and sprint.start is not None and sprint.start <= now:
        timeline = sprint_timeline(sprint, profile)
        if timeline.start is not None and timeline.end is not None:
            _, end = sprint_dates(timeline.start, timeline.end, profile.timezone)
            # A sprint nobody closed after its end date is still the work in progress: keep its scope,
            # and count capacity over what is left of the week instead of over a past date.
            if end < today:
                return _Window("sprint", today, _week_end(today), profile, overdue=True), sprint
            return _Window("sprint", today, end, profile), sprint
    # No active sprint (kanban, or between sprints): the working week.
    return _Window("semana", today, _week_end(today), profile), None


def board_people(
    data: BoardData, now: datetime, committed: CommittedLookup | None
) -> tuple[_Window, dict[str, _OnBoard]]:
    """One board's view of each person on it. Memoised on the board like its other derived reads."""

    def build() -> tuple[_Window, dict[str, _OnBoard]]:
        window, sprint = _window(data, now)
        profile = data.profile
        people: dict[str, _OnBoard] = {}

        def of(person: Person) -> _OnBoard:
            return people.setdefault(
                person.account_id,
                _OnBoard(data.board.id, data.board.name, data.board.space_key, data.board.space_name),
            )

        # Workload: what is open and assigned, at the level the sprint and its commitment count.
        scope = data.sprint_members(sprint.id, now) if sprint is not None else data.work_items()
        for history in scope:
            if not is_work_item(history) or history.status_at(now) is None or history.is_done_at(now):
                continue
            owner = history.assignee_at(now)
            if owner is None:
                continue
            entry = of(owner)
            estimate = history.estimate_at(now)
            entry.open_items += 1
            entry.unestimated += estimate is None
            entry.hours += item_cost_hours(estimate, profile)

        # Deliveries so far.
        if sprint is not None:
            report = commitment_report(
                data.sprint_members(sprint.id), sprint, now, committed(sprint.id) if committed else None
            )
            for line in report.people:
                if line.owner_id == NO_OWNER:
                    continue
                entry = of(Person(line.owner_id, line.owner_name))
                entry.delivered = line.delivered + line.added_delivered
                entry.committed = line.committed
        else:
            week_start = datetime.combine(
                window.today - timedelta(days=window.today.weekday()),
                datetime.min.time(),
                ZoneInfo(profile.timezone),
            )
            for history in data.work_items():
                done = history.done_at(now)
                owner = history.assignee_at(done) if done is not None else None
                if done is not None and owner is not None and week_start <= done <= now:
                    of(owner).delivered += 1

        # Activity: what they hold in the sprint, at any level. Load and deliveries above read only the
        # items the sprint commits to (stories, tasks, bugs); a team that plans in subtasks is working
        # all the same, and a person holding only subtasks must not read as idle.
        if sprint is not None:
            in_sprint = {h.issue.key for h in data.sprint_members(sprint.id, now)}
            held = [
                h for h in data.trackable() if h.issue.key in in_sprint or h.issue.parent_key in in_sprint
            ]
        else:
            week_from = datetime.combine(
                window.today - timedelta(days=window.today.weekday()),
                datetime.min.time(),
                ZoneInfo(profile.timezone),
            )
            held = [
                h
                for h in data.trackable()
                if not h.is_done_at(now)
                or ((done_at := h.done_at(now)) is not None and week_from <= done_at <= now)
            ]
        for history in held:
            owner = history.assignee_at(now)
            if owner is not None and history.status_at(now) is not None:
                of(owner).activity += 1

        # Blocks: any open item (subtasks included) the risk rules say is blocked, whatever else it is.
        open_owned = [
            h
            for h in data.trackable()
            if h.status_at(now) is not None and not h.is_done_at(now) and h.assignee_at(now) is not None
        ]
        for key, assessment in data.assess(open_owned, now).items():
            if any(e.situation is Situation.BLOCKED for e in assessment.evidence):
                history = data.histories[key]
                of(history.assignee_at(now)).blocked_days.append(blocked_days(history, profile, now))  # type: ignore[arg-type]

        # Past sprints, oldest first. Someone who only shows up in a past sprint still belongs here.
        columns = []
        for closed_sprint in data.closed_sprints(now, PAST_SPRINTS):
            report = commitment_report(
                data.sprint_members(closed_sprint.id),
                closed_sprint,
                now,
                committed(closed_sprint.id) if committed else None,
            )
            columns.append(
                (closed_sprint.name, {ln.owner_id: ln for ln in report.people if ln.owner_id != NO_OWNER})
            )
            for line in report.people:
                if line.owner_id != NO_OWNER:
                    of(Person(line.owner_id, line.owner_name))
        for account_id, entry in people.items():
            entry.past = [
                None
                if account_id not in lines
                else {
                    "sprint": name,
                    "delivered": lines[account_id].delivered + lines[account_id].added_delivered,
                    "committed": lines[account_id].committed,
                }
                for name, lines in columns
            ]
        return window, people

    return data._memoised(("people", now), build)


def has_activity(entries: Sequence[_OnBoard]) -> bool:
    """Something of the person's in the sprint (or in the week, on a board without one): an item they
    hold — subtasks included, open or done — a delivery, or a commitment, including one since
    delivered or taken out. Blocks do not count on
    their own: they are read across every open item, not only the sprint's, so they say nothing about
    whether the person is working in this sprint."""
    return any(e.activity or e.open_items or e.delivered or e.committed for e in entries)


def _past(entries: Sequence[_OnBoard]) -> dict[str, Any]:
    """The last sprints, summed across boards aligned from the most recent one."""
    length = max((len(e.past) for e in entries), default=0)
    points: list[dict[str, Any]] = []
    for offset in range(length, 0, -1):
        present = [
            e.past[len(e.past) - offset]
            for e in entries
            if len(e.past) >= offset and e.past[len(e.past) - offset]
        ]
        if not present:
            points.append({"label": None, "delivered": None, "committed": None})
            continue
        points.append(
            {
                "label": present[0]["sprint"],
                "delivered": sum(p["delivered"] for p in present),
                "committed": sum(p["committed"] for p in present),
            }
        )
    have = [p for p in points if p["delivered"] is not None]
    last = have[-1] if have else None
    before = have[-2] if len(have) > 1 else None
    return {
        "points": points,
        "delta": last["delivered"] - before["delivered"] if last and before else None,
        "adherence": round(last["delivered"] / last["committed"], 3) if last and last["committed"] else None,
    }


def _state(
    hours: float, capacity: float | None, entries: Sequence[_OnBoard], profile: BoardProfile
) -> tuple[str, float | None]:
    ratio = round(hours / capacity, 3) if capacity else None
    open_items = sum(e.open_items for e in entries)
    if capacity is None or capacity <= 0:
        return "sem_capacidade", None
    if open_items and all(e.unestimated == e.open_items for e in entries if e.open_items):
        return "sem_estimativa", ratio
    assert ratio is not None
    if ratio > 1 + profile.overload_threshold:
        return "acima", ratio
    if ratio < 1 + profile.idle_threshold:
        return "folga", ratio
    return "ok", ratio


def people_overview(
    boards: Sequence[BoardData],
    *,
    names: Mapping[str, str],
    absences: Iterable[Absence],
    availability: Mapping[str, Availability],
    committed: CommittedLookup | None,
    now: datetime,
) -> dict[str, Any]:
    absences = list(absences)
    windows: dict[int, _Window] = {}
    per_person: dict[str, list[_OnBoard]] = defaultdict(list)
    for data in boards:
        window, people = board_people(data, now, committed)
        windows[data.board.id] = window
        for account_id, entry in people.items():
            per_person[account_id].append(entry)

    items: list[dict[str, Any]] = []
    for account_id, entries in per_person.items():
        # Capacity is counted once, on one board: the person's horizon.
        # A board in a sprint outranks one counting a plain week: its end date is the real horizon.
        primary = max(
            entries, key=lambda e: (windows[e.board_id].kind == "sprint", e.hours, e.open_items, -e.board_id)
        )
        window = windows[primary.board_id]
        name = names.get(account_id, account_id)
        hours = round(sum(e.hours for e in entries), 2)
        capacity: float | None = None
        if window.ends_on >= window.today:
            capacity = sprint_capacity(
                [Person(account_id, name)],
                window.today,
                window.ends_on,
                window.profile,
                absences,
                availability=availability,
            )[0].hours
        state, ratio = _state(hours, capacity, entries, window.profile)
        days = sorted(d for e in entries for d in e.blocked_days)
        mine = availability.get(account_id)
        committed_total = [e.committed for e in entries if e.committed is not None]
        items.append(
            {
                "account_id": account_id,
                "name": name,
                "active": has_activity(entries),
                "boards": [
                    {
                        "id": e.board_id,
                        "name": e.board_name,
                        "space_key": e.space_key,
                        "space_name": e.space_name,
                    }
                    for e in entries
                ],
                "workload": {
                    "hours": hours,
                    "capacity_hours": capacity,
                    "ratio": ratio,
                    "state": state,
                    "open_items": sum(e.open_items for e in entries),
                    "unestimated": sum(e.unestimated for e in entries),
                    "window": window.kind,
                    "ends_on": window.ends_on.isoformat(),
                    "sprint_overdue": window.overdue,
                    "threshold": window.profile.overload_threshold,
                },
                "delivered": {
                    "count": sum(e.delivered for e in entries),
                    "committed": sum(committed_total) if committed_total else None,
                    "window": window.kind,
                },
                "blocks": {
                    "count": len(days),
                    "baixa": sum(1 for d in days if severity(d) == "baixa"),
                    "media": sum(1 for d in days if severity(d) == "media"),
                    "alta": sum(1 for d in days if severity(d) == "alta"),
                    "oldest_days": days[-1] if days else None,
                },
                "past": _past(entries),
                "availability": {
                    "hours_per_day": mine.hours_per_day if mine else None,
                    "allocation": round((mine.allocation if mine else 1.0) * 100),
                },
            }
        )
    items.sort(key=lambda p: (p["name"].casefold(), p["account_id"]))
    return {"items": items, "summary": summarize(items)}


def summarize(items: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """The team in one line: what the Home tiles say."""
    rated = [p for p in items if p["workload"]["capacity_hours"]]
    hours = sum(p["workload"]["hours"] for p in rated)
    capacity = sum(p["workload"]["capacity_hours"] for p in rated)
    days = [p["blocks"] for p in items]
    ratio = round(hours / capacity, 3) if capacity else None
    # The team is read against the default thresholds: it spans boards that may each set their own.
    limits = BoardProfile.from_parts(0, [], {}, {})
    if ratio is None:
        state = "sem_capacidade"
    elif ratio > 1 + limits.overload_threshold:
        state = "acima"
    elif ratio < 1 + limits.idle_threshold:
        state = "folga"
    else:
        state = "ok"
    committed = [p["delivered"]["committed"] for p in items if p["delivered"]["committed"] is not None]
    return {
        "people": len(items),
        "hours": round(hours, 2),
        "capacity_hours": round(capacity, 2),
        "ratio": ratio,
        "state": state,
        "above": [
            {"account_id": p["account_id"], "name": p["name"], "ratio": p["workload"]["ratio"]}
            for p in items
            if p["workload"]["state"] == "acima"
        ],
        "blocks": {
            "count": sum(b["count"] for b in days),
            "baixa": sum(b["baixa"] for b in days),
            "media": sum(b["media"] for b in days),
            "alta": sum(b["alta"] for b in days),
            "oldest_days": max(
                (b["oldest_days"] for b in days if b["oldest_days"] is not None), default=None
            ),
            "people": sum(1 for b in days if b["count"]),
        },
        "delivered": sum(p["delivered"]["count"] for p in items),
        "committed": sum(committed),
    }
