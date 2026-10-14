"""Flow views per board and per person (RF-20 … RF-23, RF-33).

People are always listed alphabetically and compared with the median of the boards in scope,
never ranked.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from collections.abc import Callable, Collection, Sequence
from datetime import datetime, timedelta
from itertools import pairwise
from typing import Any

from cadencia.analytics.data import BoardData
from cadencia.analytics.serialize import assessment_dict, iso, issue_brief, sprint_dict
from cadencia.domain.calendar import profile_checkpoints
from cadencia.domain.commitment import commitment_report
from cadencia.domain.history import IssueHistory
from cadencia.domain.metrics import (
    ItemMetrics,
    aging_thresholds,
    aging_wip,
    cumulative_flow,
    distribution,
    item_metrics,
    summarize,
    wip_average,
)
from cadencia.domain.models import BoardProfile, HierarchyLevel
from cadencia.i18n import tr

CommittedLookup = Callable[[int], Collection[str] | None]


def metrics_dict(m: ItemMetrics, board: str | None = None) -> dict[str, Any]:
    return {
        "key": m.key,
        "board": board,
        "type": m.type_name,
        "assignee": m.assignee_name,
        "assignee_id": m.assignee_id,
        "created": iso(m.created),
        "started_at": iso(m.started_at),
        "done_at": iso(m.done_at),
        "lead_days": m.lead_days,
        "cycle_days": m.cycle_days,
        "queue_days": m.queue_days,
        "blocked_days": m.blocked_days,
        "active_days": m.active_days,
        "flow_efficiency": m.flow_efficiency,
        "backward_moves": m.backward_moves,
        "reopened": m.reopened,
    }


def _completed(
    boards: Sequence[BoardData], start: datetime, end: datetime, person: str | None, type_name: str | None
) -> list[tuple[BoardData, ItemMetrics]]:
    out = []
    for data in boards:
        for history in data.work_items():
            if not history.is_done_at(end):
                continue
            m = item_metrics(history, data.profile, end)
            if m.done_at is None or not (start < m.done_at <= end):
                continue
            if person and m.assignee_id != person:
                continue
            if type_name and m.type_name != type_name:
                continue
            out.append((data, m))
    return out


def _sprint_summaries(
    boards: Sequence[BoardData], start: datetime, end: datetime, committed: CommittedLookup | None
) -> list[dict[str, Any]]:
    out = []
    for data in boards:
        for sprint in data.closed_sprints(end, limit=50):
            closed = sprint.complete or sprint.end
            if closed is None or closed <= start:
                continue
            report = commitment_report(
                data.sprint_members(sprint.id), sprint, end, committed(sprint.id) if committed else None
            )
            out.append(
                {
                    "board": data.board.name,
                    "sprint": sprint_dict(sprint),
                    "committed": report.board.committed,
                    "delivered": report.board.delivered,
                    "added": report.board.added,
                    "adherence": report.board.adherence,
                    "carryover_rate": report.carryover_rate,
                }
            )
    return out


def flow_view(
    boards: Sequence[BoardData],
    start: datetime,
    end: datetime,
    *,
    person: str | None = None,
    type_name: str | None = None,
    committed: CommittedLookup | None = None,
) -> dict[str, Any]:
    pairs = _completed(boards, start, end, person, type_name)
    metrics = [m for _, m in pairs]
    summary = summarize(metrics)
    profile = boards[0].profile if boards else BoardProfile(board_id=0)
    marks = sorted({start, *profile_checkpoints(profile, start, end), end})
    throughput = [
        {"start": iso(a), "end": iso(b), "count": sum(1 for m in metrics if m.done_at and a < m.done_at <= b)}
        for a, b in pairwise(marks)
        if b - a > timedelta(hours=1)
    ]
    wip_total = 0.0
    for data in boards:
        scope = [
            h
            for h in data.work_items()
            if (not type_name or h.issue.type_name == type_name)
            and (not person or _owner_id(h, end) == person)
        ]
        wip_total += wip_average(scope, data.profile, start, end) or 0.0
    by_person: dict[str | None, list[ItemMetrics]] = defaultdict(list)
    for m in metrics:
        by_person[m.assignee_id].append(m)
    people = []
    for account_id, items in by_person.items():
        people.append(
            {
                "account_id": account_id,
                "name": items[0].assignee_name or tr("board.no_owner"),
                "completed": len(items),
                "cycle_time": distribution(i.cycle_days for i in items).as_dict(),
                "lead_time": distribution(i.lead_days for i in items).as_dict(),
            }
        )
    people.sort(key=lambda p: str(p["name"]).casefold())
    sprints = _sprint_summaries(boards, start, end, committed)
    adherence = [s["adherence"] for s in sprints if s["adherence"] is not None]
    carry = [s["carryover_rate"] for s in sprints if s["carryover_rate"] is not None]
    return {
        "period": {"start": iso(start), "end": iso(end)},
        "summary": summary.as_dict(),
        "throughput": throughput,
        "wip_average": round(wip_total, 2),
        "commitment_adherence": round(statistics.median(adherence), 3) if adherence else None,
        "carryover_rate": round(statistics.median(carry), 3) if carry else None,
        "sprints": sprints,
        "people": people,
        "items": [metrics_dict(m, d.board.name) for d, m in pairs],
        "note": tr("board.flow.principle"),  # beside every per-person number
    }


def _owner_id(history: IssueHistory, at: datetime) -> str | None:
    owner = history.assignee_at(at)
    return owner.account_id if owner else None


def cfd_view(data: BoardData, start: datetime, end: datetime) -> dict[str, Any]:
    fallback = [tr("board.cfd.todo"), tr("board.cfd.doing"), tr("board.cfd.done")]
    return cumulative_flow(data.work_items(), data.profile, start, end, fallback_columns=fallback)


def scatter_view(
    data: BoardData, start: datetime, end: datetime, base_url: str | None = None
) -> dict[str, Any]:
    pairs = _completed([data], start, end, None, None)
    points = []
    for _, m in pairs:
        if m.cycle_days is None:
            continue
        issue = data.issues[m.key]
        points.append(
            {
                "key": m.key,
                "summary": issue.summary,
                "type": m.type_name,
                "done_at": iso(m.done_at),
                "cycle_days": m.cycle_days,
                "url": issue_brief(issue, base_url)["url"],
            }
        )
    points.sort(key=lambda p: p["done_at"] or "")
    return {"points": points, "percentiles": distribution(p["cycle_days"] for p in points).as_dict()}


def aging_view(data: BoardData, now: datetime) -> dict[str, Any]:
    thresholds = aging_thresholds(data.completed_metrics(now), data.profile.aging_percentile)
    completed = data.completed_metrics(now)
    overall = distribution(m.cycle_days for m in completed)
    return {
        "items": aging_wip(data.work_items(), data.profile, now, thresholds),
        "thresholds": thresholds,
        "percentiles": overall.as_dict(),
        "columns": data.wip_columns(),
    }


def committed_vs_delivered(
    data: BoardData, now: datetime, *, limit: int = 6, committed: CommittedLookup | None = None
) -> list[dict[str, Any]]:
    sprints = data.closed_sprints(now, limit)
    current = data.current_sprint(now)
    if current is not None and current.state == "active":
        sprints.append(current)
    rows = []
    for sprint in sprints:
        report = commitment_report(
            data.sprint_members(sprint.id), sprint, now, committed(sprint.id) if committed else None
        )
        rows.append(
            {
                "sprint": sprint_dict(sprint),
                "committed": report.board.committed,
                "delivered": report.board.delivered,
                "remaining": report.board.remaining,
                "removed": report.board.removed,
                "added": report.board.added,
                "added_delivered": report.board.added_delivered,
                "adherence": report.board.adherence,
                "carryover_rate": report.carryover_rate,
            }
        )
    return rows


def person_view(
    boards: Sequence[BoardData],
    account_id: str,
    now: datetime,
    *,
    weeks: int = 12,
    committed: CommittedLookup | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    start = now - timedelta(weeks=weeks)
    everyone = _completed(boards, start, now, None, None)
    mine = [m for _, m in everyone if m.assignee_id == account_id]
    per_person: dict[str, int] = defaultdict(int)
    for _, m in everyone:
        if m.assignee_id:
            per_person[m.assignee_id] += 1
    name = next((m.assignee_name for m in mine if m.assignee_name), None)

    trend = []
    risks = []
    unplanned = 0
    for data in boards:
        sprints = data.closed_sprints(now, 6)
        current = data.current_sprint(now)
        if current is not None and current.state == "active":
            sprints.append(current)
        for sprint in sprints:
            report = commitment_report(
                data.sprint_members(sprint.id), sprint, now, committed(sprint.id) if committed else None
            )
            line = next((p for p in report.people if p.owner_id == account_id), None)
            if line is None:
                continue
            unplanned += line.added
            window_start = sprint.start or start
            window_end = report.reference
            cycles = [m.cycle_days for m in mine if m.done_at and window_start < m.done_at <= window_end]
            trend.append(
                {
                    "board": data.board.name,
                    "sprint": sprint_dict(sprint),
                    "committed": line.committed,
                    "delivered": line.delivered,
                    "added": line.added,
                    "cycle_time": distribution(cycles).as_dict(),
                }
            )
        if current is not None:
            reference = data.reference_for(current, now)
            scope = [
                h
                for h in data.sprint_members(current.id, reference)
                if h.issue.hierarchy_level < HierarchyLevel.EPIC and _owner_id(h, reference) == account_id
            ]
            for key, assessment in data.assess(scope, reference).items():
                if name is None:
                    owner = data.histories[key].assignee_at(reference)
                    name = owner.display_name if owner else None
                if assessment.at_risk:
                    risks.append(
                        {**issue_brief(data.issues[key], base_url), "risk": assessment_dict(assessment)}
                    )
    risks.sort(key=lambda r: (-r["risk"]["severity"], r["key"]))
    summary = summarize(mine)
    reference_summary = summarize([m for _, m in everyone])
    counts = sorted(per_person.values())
    return {
        "person": {"account_id": account_id, "name": name or account_id},
        "period": {"start": iso(start), "end": iso(now), "weeks": weeks},
        "summary": summary.as_dict(),
        "boards": {
            "cycle_time": reference_summary.cycle.as_dict(),
            "lead_time": reference_summary.lead.as_dict(),
            "median_completed_per_person": statistics.median(counts) if counts else None,
        },
        "composition": {"work_mix": summary.work_mix, "unplanned_items": unplanned},
        "trend": trend,
        "risks": risks,
        "note": tr("board.flow.principle"),  # beside every per-person number
    }
