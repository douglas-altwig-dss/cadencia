"""Checkpoint snapshots and sprint commitments (RF-08).

A snapshot is derived from the changelog *as of* the checkpoint instant, so it is reproducible:
re-running a past checkpoint yields exactly the recorded rows. Existing snapshots are never
overwritten unless explicitly forced — the stored record is what was said that week.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from cadencia.analytics.data import BoardData
from cadencia.analytics.serialize import evidence_record
from cadencia.domain.calendar import last_checkpoints, sprint_timeline
from cadencia.domain.commitment import committed_at_start
from cadencia.domain.models import HierarchyLevel, Sprint
from cadencia.domain.risk import assess
from cadencia.store import repo

KANBAN_CHECKPOINTS = 8
RECENT_DONE = timedelta(days=7)


def snapshot_rows(data: BoardData, at: datetime, sprint: Sprint | None) -> list[dict[str, Any]]:
    ctx = data.risk_context(at)
    if sprint is not None:
        scope = data.sprint_members(sprint.id, at)
    else:
        scope = []
        for history in data.trackable():
            status = history.status_at(at)
            if status is None:
                continue
            done_at = history.done_at(at)
            if done_at is None or at - done_at <= RECENT_DONE:
                scope.append(history)
    rows = []
    for history in scope:
        if history.issue.hierarchy_level >= HierarchyLevel.EPIC:
            continue
        status = history.status_at(at)
        if status is None:
            continue
        assessment = assess(history, ctx)
        last = history.last_status_transition(at)
        owner = history.assignee_at(at)
        rows.append(
            {
                "issue_key": history.issue.key,
                "status_id": status.id,
                "status_name": status.name,
                "status_category": status.category.value,
                "column_name": data.profile.column_of(status.id) or status.name,
                "assignee_id": owner.account_id if owner else None,
                "assignee_name": owner.display_name if owner else None,
                "estimate": history.estimate_at(at),
                "sprint_ids": sorted(history.sprints_at(at)),
                "in_sprint": sprint is None or history.in_sprint_at(sprint.id, at),
                "flagged": history.flagged_at(at),
                "last_transition_at": last.at if last else None,
                "last_transition_author": last.author_name if last else None,
                "situation": assessment.situation.value,
                # Records, not text: a reader renders them in its own language (RF-08, R4).
                "evidence": [evidence_record(e) for e in assessment.evidence],
            }
        )
    return rows


def due_checkpoints(data: BoardData, now: datetime) -> list[tuple[datetime, int | None, int | None]]:
    """Checkpoint instants already passed that should have a snapshot."""
    marks: dict[datetime, tuple[int | None, int | None]] = {}
    if data.sprints:
        for sprint in data.sprints.values():
            if sprint.start is None or sprint.start > now:
                continue
            for window in sprint_timeline(sprint, data.profile).windows:
                if window.end <= now:
                    marks.setdefault(window.end, (sprint.id, window.index))
    else:
        for at in last_checkpoints(data.profile, now, KANBAN_CHECKPOINTS):
            marks.setdefault(at, (None, None))
    return [(at, sid, idx) for at, (sid, idx) in sorted(marks.items())]


def record_checkpoints(
    session: Session, data: BoardData, now: datetime, *, only: datetime | None = None, force: bool = False
) -> int:
    written = 0
    for at, sprint_id, index in due_checkpoints(data, now):
        if only is not None and at != only:
            continue
        checkpoint_id = repo.ensure_checkpoint(
            session, data.board.id, at, sprint_id=sprint_id, window_index=index
        )
        if not force and repo.snapshot_count(session, checkpoint_id):
            continue
        rows = snapshot_rows(data, at, data.sprints.get(sprint_id) if sprint_id else None)
        repo.save_snapshots(session, checkpoint_id, rows, overwrite=force)
        written += len(rows)
    return written


def record_commitments(session: Session, data: BoardData, now: datetime) -> int:
    written = 0
    for sprint in data.sprints.values():
        if sprint.start is None or sprint.start > now or repo.load_commitment(session, sprint.id) is not None:
            continue
        scope = data.sprint_members(sprint.id)
        keys = committed_at_start(scope, sprint)
        rows = []
        for key in sorted(keys):
            history = data.histories[key]
            owner = history.assignee_at(sprint.start)
            rows.append(
                {
                    "issue_key": key,
                    "estimate": history.estimate_at(sprint.start),
                    "assignee_id": owner.account_id if owner else None,
                }
            )
        repo.save_commitment(session, sprint.id, rows)
        written += len(rows)
    return written
