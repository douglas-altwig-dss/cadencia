"""Comparison between two consecutive checkpoints (RF-09)."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime

from cadencia.domain.history import IssueHistory
from cadencia.domain.models import ChangeField


@dataclass(frozen=True)
class WindowDiff:
    start: datetime
    end: datetime
    completed: tuple[str, ...]  # moved into the done category inside the window
    added: tuple[str, ...]  # entered the sprint during the window (after the sprint start)
    removed: tuple[str, ...]  # left the sprint during the window
    unmoved: tuple[str, ...]  # open, in the sprint at both ends, no status transition

    def as_dict(self) -> dict[str, object]:
        return {
            "start": self.start,
            "end": self.end,
            "completed": list(self.completed),
            "added": list(self.added),
            "removed": list(self.removed),
            "unmoved": list(self.unmoved),
        }


def compare_window(
    histories: Iterable[IssueHistory], start: datetime, end: datetime, sprint_id: int | None = None
) -> WindowDiff:
    completed, added, removed, unmoved = [], [], [], []
    for h in histories:
        key = h.issue.key
        if sprint_id is None:
            member_start = h.issue.created <= start
            member_end = h.issue.created <= end
        else:
            member_start = h.in_sprint_at(sprint_id, start)
            member_end = h.in_sprint_at(sprint_id, end)
        done_start = h.is_done_at(start)
        done_end = h.is_done_at(end)
        if member_end and done_end and not done_start:
            completed.append(key)
        if member_end and not member_start:
            added.append(key)
        if member_start and not member_end:
            removed.append(key)
        if (
            member_start
            and member_end
            and not done_end
            and not h.transitions_between(start, end, ChangeField.STATUS)
        ):
            unmoved.append(key)
    return WindowDiff(
        start=start,
        end=end,
        completed=tuple(sorted(completed)),
        added=tuple(sorted(added)),
        removed=tuple(sorted(removed)),
        unmoved=tuple(sorted(unmoved)),
    )
