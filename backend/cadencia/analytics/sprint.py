"""Sprint, epic, risk and item views (RF-06 … RF-19, RF-28, RF-31, RF-32)."""

from __future__ import annotations

from collections import Counter
from collections.abc import Collection, Iterable
from datetime import datetime
from typing import Any

from cadencia.analytics.data import BoardData
from cadencia.analytics.serialize import (
    assessment_dict,
    iso,
    issue_brief,
    node_dict,
    progress_dict,
    sprint_dict,
    window_dict,
)
from cadencia.domain.calendar import calendar_windows, sprint_timeline
from cadencia.domain.commitment import NO_OWNER_ID, CommitmentReport, commitment_report
from cadencia.domain.compare import compare_window
from cadencia.domain.hierarchy import build_tree, find_node, progress_of
from cadencia.domain.metrics import item_metrics
from cadencia.domain.models import HierarchyLevel, Sprint
from cadencia.domain.risk import SEVERITY, RiskAssessment
from cadencia.errors import NotFound
from cadencia.i18n import Msg, render, tr


def risk_counts(assessments: Iterable[RiskAssessment]) -> dict[str, int]:
    counts = Counter(a.situation for a in assessments)
    return {s.value: counts.get(s, 0) for s in SEVERITY}


def commitment_dict(report: CommitmentReport, data: BoardData, base_url: str | None) -> dict[str, Any]:
    keys = set(report.committed) | set(report.added)
    people = [p.as_dict() for p in report.people]
    for line in people:  # the domain leaves the no-assignee line unnamed: name it for the reader
        if line["owner_id"] == NO_OWNER_ID:
            line["owner_name"] = tr("board.no_owner")
    people.sort(key=lambda p: str(p["owner_name"]).casefold())
    return {
        "reference": iso(report.reference),
        "closed": report.closed,
        "carryover_rate": report.carryover_rate,
        "board": report.board.as_dict(),
        "people": people,
        "sets": {
            "committed": report.committed,
            "delivered": report.delivered,
            "remaining": report.remaining,
            "removed": report.removed,
            "added": report.added,
            "added_delivered": report.added_delivered,
        },
        "items": {k: issue_brief(data.issues[k], base_url) for k in sorted(keys) if k in data.issues},
    }


def sprint_overview(
    data: BoardData,
    sprint: Sprint,
    now: datetime,
    *,
    committed: Collection[str] | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    reference = data.reference_for(sprint, now)
    timeline = sprint_timeline(sprint, data.profile)
    scope = data.sprint_members(sprint.id)
    # Window sets count standard work items only, like the commitment: subtasks travel with
    # their parent and would otherwise inflate throughput.
    work_scope = [h for h in scope if h.issue.hierarchy_level == HierarchyLevel.STANDARD]
    current = [h for h in scope if h.in_sprint_at(sprint.id, reference)]
    work = [h for h in current if h.issue.hierarchy_level == HierarchyLevel.STANDARD]
    progress = progress_of(
        [h.issue for h in work], is_done=lambda i: data.histories[i.key].is_done_at(reference)
    )
    assessments = data.assess(
        [h for h in current if h.issue.hierarchy_level < HierarchyLevel.EPIC], reference
    )
    windows = []
    referenced: set[str] = set()
    for window in timeline.windows:
        if window.start >= reference:
            state = "futura"
        elif window.end <= reference:
            state = "fechada"
        else:
            state = "aberta"
        entry: dict[str, Any] = {**window_dict(window), "state": state}
        if state != "futura":
            diff = compare_window(work_scope, window.start, min(window.end, reference), sprint.id)
            sets = {
                "completed": list(diff.completed),
                "added": list(diff.added),
                "removed": list(diff.removed),
                "unmoved": list(diff.unmoved),
            }
            entry["diff"] = sets
            entry["throughput"] = len(diff.completed)
            for keys in sets.values():
                referenced.update(keys)
        windows.append(entry)
    # RF-112: each item's own epic, so the overview can group by it instead of listing every
    # story and task at the same level as its epic's own.
    referenced |= {
        data.issues[k].parent_key for k in referenced if k in data.issues and data.issues[k].parent_key
    }
    current_window = timeline.current_window(reference)
    report = commitment_report(scope, sprint, now, committed)
    return {
        "board": {"id": data.board.id, "name": data.board.name},
        "sprint": sprint_dict(sprint),
        "reference": iso(reference),
        "timeline": {
            "start": iso(timeline.start),
            "end": iso(timeline.end),
            "assumed_end": timeline.assumed_end,
            "warnings": [render(w) for w in timeline.warnings],
            "windows": windows,
            "current_window": current_window.index if current_window else None,
        },
        "progress": progress_dict(progress),
        "risk_counts": risk_counts(assessments.values()),
        "commitment": commitment_dict(report, data, base_url),
        "items": {k: issue_brief(data.issues[k], base_url) for k in sorted(referenced) if k in data.issues},
        "freshness": data.freshness(now),
    }


BOARD_OVERVIEW_WEEKS = 4


def board_overview(data: BoardData, now: datetime, base_url: str | None = None) -> dict[str, Any]:
    """RF-113: `sprint_overview`'s own shape, for a board with no sprint to carry it — the weekly
    windows come from the calendar instead of the sprint's own timeline, and `compare_window`'s
    `sprint_id=None` mode already treats "existed by then" as membership, which is the only
    membership a kanban board's items ever had. There is no sprint-bound "progresso"/"comprometido"
    to report — a kanban item was never promised by a start date — so this carries only what
    continuous flow actually has: the windows, who is open and at risk right now, and (via the
    sibling `board_forecast`) the pace they are clearing at."""
    work_scope = data.work_items()
    windows = []
    referenced: set[str] = set()
    for window in calendar_windows(data.profile, now, BOARD_OVERVIEW_WEEKS):
        state = "aberta" if window.end > now else "fechada"
        entry: dict[str, Any] = {**window_dict(window), "state": state}
        diff = compare_window(work_scope, window.start, min(window.end, now))
        sets = {
            "completed": list(diff.completed),
            "added": list(diff.added),
            "removed": list(diff.removed),
            "unmoved": list(diff.unmoved),
        }
        entry["diff"] = sets
        entry["throughput"] = len(diff.completed)
        for keys in sets.values():
            referenced.update(keys)
        windows.append(entry)
    # RF-112: each item's own epic, so the overview can group by it, same as the sprint's own.
    referenced |= {
        data.issues[k].parent_key for k in referenced if k in data.issues and data.issues[k].parent_key
    }
    open_now = data.open_items(now)
    assessments = data.assess([h for h in open_now if h.issue.hierarchy_level < HierarchyLevel.EPIC], now)
    return {
        "board": {"id": data.board.id, "name": data.board.name},
        "reference": iso(now),
        "timeline": {"windows": windows},
        "risk_counts": risk_counts(assessments.values()),
        "items": {k: issue_brief(data.issues[k], base_url) for k in sorted(referenced) if k in data.issues},
        "freshness": data.freshness(now),
    }


def _with_family(data: BoardData, keys: set[str]) -> set[str]:
    out = set(keys)
    for history in data.histories.values():  # subtasks of members
        if history.issue.parent_key in keys:
            out.add(history.issue.key)
    frontier = list(out)
    while frontier:  # ancestors (epic, initiative) for grouping
        issue = data.issues.get(frontier.pop())
        parent = issue.parent_key if issue else None
        if parent and parent in data.issues and parent not in out:
            out.add(parent)
            frontier.append(parent)
    return out


def sprint_tree(
    data: BoardData, sprint: Sprint, now: datetime, base_url: str | None = None
) -> list[dict[str, Any]]:
    reference = data.reference_for(sprint, now)
    members = {h.issue.key for h in data.sprint_members(sprint.id, reference)}
    keys = _with_family(data, members)
    issues = [data.issues[k] for k in keys]
    nodes = build_tree(issues, is_done=lambda i: data.histories[i.key].is_done_at(reference))
    assessments = data.assess(
        [data.histories[k] for k in keys if data.issues[k].hierarchy_level < HierarchyLevel.EPIC], reference
    )
    return [node_dict(n, assessments, base_url) for n in nodes]


def board_tree(data: BoardData, now: datetime, base_url: str | None = None) -> list[dict[str, Any]]:
    """RF-113: `sprint_tree`'s own shape, for a board with no sprint to scope by — every tracked
    item is already the board's own window (collection itself is bounded to what is open or
    recently touched), so there is no membership set to compute before walking ancestors."""
    members = {h.issue.key for h in data.trackable()}
    keys = _with_family(data, members)
    issues = [data.issues[k] for k in keys]
    nodes = build_tree(issues, is_done=lambda i: data.histories[i.key].is_done_at(now))
    assessments = data.assess(
        [data.histories[k] for k in keys if data.issues[k].hierarchy_level < HierarchyLevel.EPIC], now
    )
    return [node_dict(n, assessments, base_url) for n in nodes]


def _bar(history: Any, profile: Any, reference: datetime) -> tuple[datetime | None, datetime | None]:
    """When an item's work started and, if it is done, finished: its bar on the timeline.

    An item that went straight to done has no "in progress" stretch, so its bar is a point at the
    moment it finished; one never started has no bar."""
    done = history.done_at(reference)
    began = (
        history.first_entry(profile.is_wip)
        if done
        else (history.current_run_start(profile.is_wip, reference) or history.first_entry(profile.is_wip))
    )
    if began is not None and done is not None and began > done:
        began = done
    return (began if began is not None else done), done


def sprint_timeline_view(
    data: BoardData, sprint: Sprint, now: datetime, base_url: str | None = None
) -> dict[str, Any]:
    """Every item of the sprint — epics, stories, tasks, bugs and their subtasks — as a tree whose
    rows carry the time they were worked on, for drawing against the sprint's days."""
    reference = data.reference_for(sprint, now)
    timeline = sprint_timeline(sprint, data.profile)
    members = {h.issue.key for h in data.sprint_members(sprint.id, reference)}
    rows, counts = timeline_rows(data, _with_family(data, members), members, reference, sprint, base_url)
    return {
        "sprint": sprint_dict(sprint),
        "window": {"start": iso(timeline.start), "end": iso(timeline.end), "today": iso(reference)},
        "counts": {**counts, "total": sum(counts.values())},
        "nodes": [iso_rows(r) for r in rows],
        "freshness": data.freshness(now),
    }


def timeline_rows(
    data: BoardData,
    keys: set[str],
    members: set[str],
    reference: datetime,
    sprint: Sprint | None = None,
    base_url: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """The timeline's tree over ``keys`` (the items and the ancestors they are grouped under), each
    row with its own bar or, for a container, the span of what is under it. ``members`` are the rows
    that belong to the view in their own right; ``sprint`` adds the sprint's own marks (carried over,
    added after the start) and is ``None`` for a period such as a person's last weeks. Datetimes stay
    datetimes here: ``iso_rows`` serialises them."""
    nodes = build_tree(
        [data.issues[k] for k in keys], is_done=lambda i: data.histories[i.key].is_done_at(reference)
    )
    assessments = data.assess(
        [data.histories[k] for k in keys if data.issues[k].hierarchy_level < HierarchyLevel.EPIC], reference
    )
    profile = data.profile
    counts = {"epicos": 0, "itens": 0, "subtarefas": 0}

    def row(node: Any) -> dict[str, Any]:
        children = [row(c) for c in node.children]
        issue = node.issue
        out: dict[str, Any] = {
            "key": node.key,
            "label": render(node.label),
            "synthetic": node.synthetic,
            "missing": node.missing,
            "issue": issue_brief(issue, base_url) if issue else None,
            "member": node.key in members,
            "progress": progress_dict(node.progress),
            "risk": None,
            "blocked": False,
            "carried": False,
            "added": False,
        }
        container = issue is None or issue.hierarchy_level >= HierarchyLevel.EPIC
        if issue is not None and not container:
            history = data.histories[issue.key]
            own_start, own_end = _bar(history, profile, reference)
            done = own_end is not None
            assessment = assessments.get(issue.key)
            blocked = (
                not done and assessment is not None and any(e.rule == "bloqueio" for e in assessment.evidence)
            )
            out["risk"] = None if done else assessment_dict(assessment)
            out["blocked"] = blocked
            out["added"] = (
                sprint is not None
                and node.key in members
                and sprint.start is not None
                and not history.in_sprint_at(sprint.id, sprint.start)
            )
            out["state"] = (
                "concluido"
                if done
                else "bloqueado"
                if blocked
                else "andamento"
                if own_start is not None
                else "aberto"
            )
            counts["subtarefas" if issue.is_subtask else "itens"] += 1
            if own_start is not None:
                out["start"], out["end"] = own_start, own_end
        # RF-111: an initiative is a container too (same bar-spanning rule as an epic, just one
        # level further up), but "N épicos" would be wrong once one sits in the tree — it is
        # named in its own node's label instead, not folded into a count that promises epics.
        elif issue is not None and issue.hierarchy_level == HierarchyLevel.EPIC:
            counts["epicos"] += 1
        if "start" not in out:
            # A container, or an item with no time of its own, spans its children.
            out.update(span_of(children))
            if container or "state" not in out:
                out["state"] = span_state(out["start"], children)
                out["blocked"] = any(c["blocked"] for c in children)
        out["carried"] = bool(sprint and out["start"] and sprint.start and out["start"] < sprint.start)
        out["children"] = children
        return out

    return [row(n) for n in nodes], counts


def span_of(children: list[dict[str, Any]]) -> dict[str, Any]:
    """Where a row with no time of its own starts and ends: with its first child, and only once
    every child is done — one child still open keeps the bar running."""
    begun = [c["start"] for c in children if c["start"] is not None]
    finished = [c["end"] for c in children if c["end"] is not None]
    still_open = any(c["state"] != "concluido" for c in children)
    return {
        "start": min(begun) if begun else None,
        "end": None if still_open or not finished else max(finished),
    }


def span_state(start: datetime | None, children: list[dict[str, Any]]) -> str:
    """A container's state: done when every child is, in progress once anything under it started."""
    everyone_done = bool(children) and all(c["state"] == "concluido" for c in children if c.get("state"))
    return "concluido" if everyone_done else "andamento" if start is not None else "aberto"


def group_row(key: str, label: str, children: list[dict[str, Any]]) -> dict[str, Any]:
    """A synthetic row grouping others (a person's boards, say), spanning them like an epic does."""
    span = span_of(children)
    return {
        "key": key,
        "label": label,
        "synthetic": True,
        "missing": False,
        "issue": None,
        "member": False,
        "progress": None,
        "risk": None,
        "blocked": any(c["blocked"] for c in children),
        "carried": False,
        "added": False,
        "state": span_state(span["start"], children),
        **span,
        "children": children,
    }


def iso_rows(row: dict[str, Any]) -> dict[str, Any]:
    return {
        **row,
        "start": iso(row["start"]),
        "end": iso(row["end"]),
        "children": [iso_rows(c) for c in row["children"]],
    }


def epic_view(data: BoardData, epic_key: str, now: datetime, base_url: str | None = None) -> dict[str, Any]:
    if epic_key not in data.issues:
        raise NotFound(epic_key, Msg("board.not_found.epic", key=epic_key))
    keys = {epic_key}
    frontier = [epic_key]
    while frontier:
        parent = frontier.pop()
        for history in data.histories.values():
            if history.issue.parent_key == parent and history.issue.key not in keys:
                keys.add(history.issue.key)
                frontier.append(history.issue.key)
    nodes = build_tree(
        [data.issues[k] for k in keys], is_done=lambda i: data.histories[i.key].is_done_at(now)
    )
    node = find_node(nodes, epic_key)
    assessments = data.assess([data.histories[k] for k in keys if k != epic_key], now)
    return {
        "epic": issue_brief(data.issues[epic_key], base_url),
        "board": {"id": data.board.id, "name": data.board.name},
        "description": data.issues[epic_key].description,
        "tree": node_dict(node, assessments, base_url) if node else None,
        "risk_counts": risk_counts(assessments.values()),
        "freshness": data.freshness(now),
    }


def risk_list(
    data: BoardData,
    now: datetime,
    *,
    sprint: Sprint | None = None,
    situations: Collection[str] | None = None,
    person: str | None = None,
    type_name: str | None = None,
    base_url: str | None = None,
) -> list[dict[str, Any]]:
    if sprint is not None:
        reference = data.reference_for(sprint, now)
        scope = [
            h
            for h in data.sprint_members(sprint.id, reference)
            if h.issue.hierarchy_level < HierarchyLevel.EPIC
        ]
    else:
        reference = now
        scope = data.open_items(now)
    assessments = data.assess(scope, reference)
    rows = []
    for history in scope:
        assessment = assessments[history.issue.key]
        if situations and assessment.situation.value not in situations:
            continue
        owner = history.assignee_at(reference)
        if person and (owner is None or owner.account_id != person):
            continue
        if type_name and history.issue.type_name != type_name:
            continue
        brief = issue_brief(history.issue, base_url)
        brief["assignee"] = owner.display_name if owner else None
        brief["assignee_id"] = owner.account_id if owner else None
        brief["risk"] = assessment_dict(assessment)
        rows.append(brief)
    rows.sort(key=lambda r: (-r["risk"]["severity"], r["key"]))
    return rows


def issue_detail(data: BoardData, key: str, now: datetime, base_url: str | None = None) -> dict[str, Any]:
    history = data.histories.get(key)
    if history is None:
        raise NotFound(key, Msg("board.not_found.item", key=key))
    issue = history.issue
    profile = data.profile
    assessment = data.assess([history], now)[key]
    metrics = item_metrics(history, profile, now)
    parent = data.issues.get(issue.parent_key or "")
    children = sorted(
        (h.issue for h in data.histories.values() if h.issue.parent_key == key),
        key=lambda i: (i.rank or "~", i.key),
    )
    return {
        "issue": issue_brief(issue, base_url),
        "description": issue.description,
        "board": {"id": data.board.id, "name": data.board.name},
        "risk": assessment_dict(assessment),
        "metrics": {
            "lead_days": metrics.lead_days,
            "cycle_days": metrics.cycle_days,
            "queue_days": metrics.queue_days,
            "blocked_days": metrics.blocked_days,
            "active_days": metrics.active_days,
            "flow_efficiency": metrics.flow_efficiency,
            "backward_moves": metrics.backward_moves,
            "reopened": metrics.reopened,
            "started_at": iso(metrics.started_at),
            "done_at": iso(metrics.done_at),
        },
        "sprints": [sprint_dict(data.sprints[s]) for s in sorted(history.all_sprints()) if s in data.sprints],
        "status_intervals": [
            {
                "status": iv.status.name,
                "category": iv.status.category.value,
                "column": profile.column_of(iv.status.id),
                "start": iso(iv.start),
                "end": iso(iv.end),
                "days": round(((iv.end or now) - iv.start).total_seconds() / 86400, 2),
            }
            for iv in history.status_intervals
        ],
        "transitions": [
            {
                "at": iso(t.at),
                "field": t.field.value,
                "from": t.from_value,
                "to": t.to_value,
                "author": t.author_name,
            }
            for t in history.transitions
        ],
        "parent": issue_brief(parent, base_url) if parent else None,
        "children": [issue_brief(c, base_url) for c in children],
        "freshness": data.freshness(now),
    }
