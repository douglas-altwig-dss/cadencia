"""What is happening across the boards in view: recent deliveries, what is due, and the last day or
two of events. The Home tiles that answer "o que está acontecendo" read this; nothing here is per
person and nothing is a grade — it is the team's own log, newest first."""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from cadencia.analytics.data import BoardData
from cadencia.analytics.serialize import iso
from cadencia.domain.models import ChangeField, HierarchyLevel

DAYS = 7
FEED_HOURS = 48
FEED_LIMIT = 30
DUE_ITEMS = 5


def _events(data: BoardData, now: datetime) -> list[dict[str, Any]]:
    """Delivered, blocked and scope-added events of the last ``FEED_HOURS``, oldest first."""
    since = now - timedelta(hours=FEED_HOURS)
    profile = data.profile
    sprint = data.current_sprint(now)
    started = sprint.start if sprint is not None and sprint.state == "active" else None
    out: list[dict[str, Any]] = []
    tick = timedelta(microseconds=1)

    def add(kind: str, at: datetime, history: Any) -> None:
        who = history.assignee_at(at)
        out.append(
            {
                "kind": kind,
                "at": iso(at),
                "key": history.issue.key,
                "summary": history.issue.summary,
                "who": who.display_name if who else None,
                "board": {"id": data.board.id, "name": data.board.name},
            }
        )

    for history in data.trackable():
        for t in history.transitions_between(since, now):
            if t.field is ChangeField.STATUS:
                after, before = history.status_at(t.at), history.status_at(t.at - tick)
                if after is None:
                    continue
                if (
                    after.category.value == "done"
                    and history.issue.hierarchy_level == HierarchyLevel.STANDARD
                ):
                    if before is None or before.category.value != "done":
                        add("entregue", t.at, history)
                elif profile.is_blocked_status(after) and (
                    before is None or not profile.is_blocked_status(before)
                ):
                    add("bloqueado", t.at, history)
            elif t.field is ChangeField.FLAGGED and (t.to_value or "").strip():
                add("bloqueado", t.at, history)
            elif t.field is ChangeField.SPRINT and sprint is not None and started is not None:
                gained = history.sprints_at(t.at) - history.sprints_at(t.at - tick)
                # Joining the sprint after its first day is scope that came in, not the plan.
                if sprint.id in gained and t.at > started + timedelta(days=1):
                    add("escopo", t.at, history)
    return out


def pulse(boards: Sequence[BoardData], now: datetime) -> dict[str, Any]:
    zone = ZoneInfo(boards[0].profile.timezone) if boards else ZoneInfo("UTC")
    today: date = now.astimezone(zone).date()
    per_day: Counter[date] = Counter()
    soon: list[dict[str, Any]] = []
    overdue = 0
    events: list[dict[str, Any]] = []
    for data in boards:
        tz = ZoneInfo(data.profile.timezone)
        local_today = now.astimezone(tz).date()
        for history in data.work_items():
            done = history.done_at(now)
            if done is not None and now - done < timedelta(days=2 * DAYS):
                per_day[done.astimezone(zone).date()] += 1
            if done is None and history.status_at(now) is not None and history.issue.due_date is not None:
                left = (history.issue.due_date - local_today).days
                if left < 0:
                    overdue += 1
                elif left <= DAYS:
                    owner = history.assignee_at(now)
                    soon.append(
                        {
                            "key": history.issue.key,
                            "summary": history.issue.summary,
                            "due_in_days": left,
                            "who": owner.display_name if owner else None,
                            "board": {"id": data.board.id, "name": data.board.name},
                        }
                    )
        events.extend(_events(data, now))
    days = [today - timedelta(days=i) for i in range(DAYS - 1, -1, -1)]
    before = [today - timedelta(days=i) for i in range(2 * DAYS - 1, DAYS - 1, -1)]
    soon.sort(key=lambda i: (i["due_in_days"], i["key"]))
    events.sort(key=lambda e: e["at"], reverse=True)
    return {
        "recent": {
            "days": [{"date": d.isoformat(), "delivered": per_day[d]} for d in days],
            "total": sum(per_day[d] for d in days),
            "previous_total": sum(per_day[d] for d in before),
        },
        "due": {"soon": len(soon), "overdue": overdue, "items": soon[:DUE_ITEMS]},
        "feed": events[:FEED_LIMIT],
    }
