"""Committed versus delivered, with added scope kept apart (RF-28).

Without separating what entered after the sprint started, every board looks like it missed its
commitment. Only standard work items (hierarchy level 0) count: subtasks travel with their parent
and epics are containers.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Collection, Iterable
from dataclasses import dataclass, field
from datetime import datetime

from cadencia.domain.history import IssueHistory
from cadencia.domain.models import HierarchyLevel, Sprint

BOARD = "__board__"  # the board-wide roll-up line, beside the one line per person


@dataclass
class CommitmentLine:
    owner_id: str
    owner_name: str
    committed: int = 0
    delivered: int = 0
    remaining: int = 0
    removed: int = 0
    added: int = 0
    added_delivered: int = 0
    committed_estimate: float = 0.0
    delivered_estimate: float = 0.0
    added_estimate: float = 0.0

    @property
    def adherence(self) -> float | None:
        return round(self.delivered / self.committed, 3) if self.committed else None

    def as_dict(self) -> dict[str, object]:
        return {
            "owner_id": self.owner_id,
            "owner_name": self.owner_name,
            "committed": self.committed,
            "delivered": self.delivered,
            "remaining": self.remaining,
            "removed": self.removed,
            "added": self.added,
            "added_delivered": self.added_delivered,
            "committed_estimate": self.committed_estimate,
            "delivered_estimate": self.delivered_estimate,
            "added_estimate": self.added_estimate,
            "adherence": self.adherence,
        }


@dataclass
class CommitmentReport:
    sprint_id: int
    reference: datetime
    closed: bool
    board: CommitmentLine
    people: list[CommitmentLine]
    committed: list[str] = field(default_factory=list)
    delivered: list[str] = field(default_factory=list)
    remaining: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    added: list[str] = field(default_factory=list)
    added_delivered: list[str] = field(default_factory=list)

    @property
    def carryover_rate(self) -> float | None:
        """Share of the commitment left open when the sprint closed."""
        if not self.closed or not self.committed:
            return None
        return round(len(self.remaining) / len(self.committed), 3)


def is_work_item(history: IssueHistory) -> bool:
    return history.issue.hierarchy_level == HierarchyLevel.STANDARD


def committed_at_start(histories: Iterable[IssueHistory], sprint: Sprint) -> set[str]:
    if sprint.start is None:
        return set()
    return {h.issue.key for h in histories if is_work_item(h) and h.in_sprint_at(sprint.id, sprint.start)}


def commitment_report(
    histories: Iterable[IssueHistory],
    sprint: Sprint,
    as_of: datetime,
    committed_keys: Collection[str] | None = None,
) -> CommitmentReport:
    items = [h for h in histories if is_work_item(h)]
    closed_at = sprint.complete or (sprint.end if sprint.state == "closed" else None)
    reference = min(as_of, closed_at) if closed_at else as_of
    committed = set(committed_keys) if committed_keys is not None else committed_at_start(items, sprint)

    board = CommitmentLine(BOARD, "Board")
    people: dict[str, CommitmentLine] = {}
    report = CommitmentReport(sprint.id, reference, closed_at is not None and closed_at <= as_of, board, [])

    def line(history: IssueHistory, at: datetime) -> CommitmentLine:
        person = history.assignee_at(at)
        key = person.account_id if person else "__sem_responsavel__"
        name = person.display_name if person else "Sem responsável"
        return people.setdefault(key, CommitmentLine(key, name))

    buckets: dict[str, list[str]] = defaultdict(list)
    for h in sorted(items, key=lambda x: x.issue.key):
        key = h.issue.key
        member_end = h.in_sprint_at(sprint.id, reference)
        done = h.is_done_at(reference)
        estimate_start = h.estimate_at(sprint.start) if sprint.start else h.issue.estimate
        estimate_end = h.estimate_at(reference)
        if key in committed:
            owner = line(h, sprint.start or reference)
            for target in (board, owner):
                target.committed += 1
                target.committed_estimate += estimate_start or 0.0
            buckets["committed"].append(key)
            if not member_end:
                buckets["removed"].append(key)
                for target in (board, owner):
                    target.removed += 1
            elif done:
                # The commitment belongs to whoever took the item at the start, even if someone
                # else finished it; otherwise a hand-over would look like a missed commitment.
                buckets["delivered"].append(key)
                for target in (board, owner):
                    target.delivered += 1
                    target.delivered_estimate += estimate_end or 0.0
            else:
                buckets["remaining"].append(key)
                for target in (board, owner):
                    target.remaining += 1
        elif member_end:
            owner = line(h, reference)
            buckets["added"].append(key)
            for target in (board, owner):
                target.added += 1
                target.added_estimate += estimate_end or 0.0
            if done:
                buckets["added_delivered"].append(key)
                for target in (board, owner):
                    target.added_delivered += 1

    report.people = sorted(people.values(), key=lambda p: p.owner_name.casefold())
    for name, keys in buckets.items():
        setattr(report, name, keys)
    return report
