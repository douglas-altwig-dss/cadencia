"""Issue timelines reconstructed from the changelog.

The current state alone cannot say what *did not move*; the changelog can. Every "as of"
question (status, assignee, sprint membership, estimate, flag) is answered here, which is what
makes snapshots reproducible: the same changelog and instant always give the same answer.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta

from cadencia.domain.models import (
    ChangeField,
    Issue,
    Person,
    Status,
    StatusCategory,
    Transition,
)

_INT = re.compile(r"\d+")


def parse_sprint_ids(raw: str | None) -> frozenset[int]:
    return frozenset(int(x) for x in _INT.findall(raw or ""))


def parse_estimate(raw: str | None) -> float | None:
    if raw is None or str(raw).strip() == "":
        return None
    try:
        return float(str(raw).replace(",", "."))
    except ValueError:
        return None


@dataclass(frozen=True, slots=True)
class StatusInterval:
    status: Status
    start: datetime
    end: datetime | None  # None: still the current status

    def overlap(self, start: datetime, end: datetime) -> timedelta:
        lo = max(self.start, start)
        hi = min(self.end or end, end)
        return max(hi - lo, timedelta(0))


class IssueHistory:
    def __init__(
        self,
        issue: Issue,
        transitions: Iterable[Transition],
        statuses: Mapping[str, Status] | None = None,
    ) -> None:
        self.issue = issue
        ordered = sorted(transitions, key=lambda t: (t.at, t.history_id, t.item_index))
        self.transitions: tuple[Transition, ...] = tuple(ordered)
        self._by_field: dict[ChangeField, list[Transition]] = {f: [] for f in ChangeField}
        for t in ordered:
            self._by_field[t.field].append(t)
        self._statuses = statuses or {}
        self.status_intervals: tuple[StatusInterval, ...] = self._build_status_intervals()

    # ------------------------------------------------------------------ status

    def _status(self, status_id: str | None, name: str | None) -> Status:
        if status_id and status_id in self._statuses:
            return self._statuses[status_id]
        if status_id == self.issue.status.id:
            return self.issue.status
        # Status deleted from the instance: best effort, treated as not started.
        return Status(id=status_id or "?", name=name or "?", category=StatusCategory.TODO)

    def _build_status_intervals(self) -> tuple[StatusInterval, ...]:
        changes = self._by_field[ChangeField.STATUS]
        created = self.issue.created
        if not changes:
            return (StatusInterval(self.issue.status, created, None),)
        intervals: list[StatusInterval] = []
        current = self._status(changes[0].from_id, changes[0].from_value)
        start = created
        for t in changes:
            at = max(t.at, start)
            intervals.append(StatusInterval(current, start, at))
            current = self._status(t.to_id, t.to_value)
            start = at
        intervals.append(StatusInterval(current, start, None))
        return tuple(iv for iv in intervals if iv.end is None or iv.end > iv.start)

    def status_at(self, at: datetime) -> Status | None:
        if at < self.issue.created:
            return None
        for interval in reversed(self.status_intervals):
            if interval.start <= at:
                return interval.status
        return self.status_intervals[0].status

    def category_at(self, at: datetime) -> StatusCategory | None:
        status = self.status_at(at)
        return status.category if status else None

    def is_done_at(self, at: datetime) -> bool:
        return self.category_at(at) is StatusCategory.DONE

    @property
    def status_transitions(self) -> list[Transition]:
        return list(self._by_field[ChangeField.STATUS])

    def transitions_between(
        self, start: datetime, end: datetime, field: ChangeField | None = None
    ) -> list[Transition]:
        source = self.transitions if field is None else self._by_field[field]
        return [t for t in source if start < t.at <= end]

    def last_status_transition(self, at: datetime) -> Transition | None:
        before = [t for t in self._by_field[ChangeField.STATUS] if t.at <= at]
        return before[-1] if before else None

    def last_status_change_at(self, at: datetime) -> datetime:
        last = self.last_status_transition(at)
        return last.at if last else self.issue.created

    def first_entry(self, predicate: Callable[[Status], bool]) -> datetime | None:
        for interval in self.status_intervals:
            if predicate(interval.status):
                return interval.start
        return None

    def current_run_start(self, predicate: Callable[[Status], bool], at: datetime) -> datetime | None:
        """Start of the uninterrupted stretch, ending at ``at``, where ``predicate`` holds."""
        start: datetime | None = None
        for interval in self.status_intervals:
            if interval.start > at:
                break
            if predicate(interval.status):
                start = start or interval.start
            else:
                start = None
        return start

    def done_at(self, at: datetime | None = None) -> datetime | None:
        """Moment the issue entered its current done stretch, if it is done at ``at``."""
        at = at or self.status_intervals[-1].start
        if not self.is_done_at(at):
            return None
        return self.current_run_start(lambda s: s.category is StatusCategory.DONE, at)

    def time_in(self, predicate: Callable[[Status], bool], start: datetime, end: datetime) -> timedelta:
        total = timedelta(0)
        for interval in self.status_intervals:
            if predicate(interval.status):
                total += interval.overlap(start, end)
        return total

    def reopened(self, until: datetime | None = None) -> bool:
        for t in self._by_field[ChangeField.STATUS]:
            if until is not None and t.at > until:
                break
            before = self._status(t.from_id, t.from_value)
            after = self._status(t.to_id, t.to_value)
            if before.category is StatusCategory.DONE and after.category is not StatusCategory.DONE:
                return True
        return False

    def backward_moves(self, order: Callable[[Status], float], until: datetime | None = None) -> int:
        count = 0
        for t in self._by_field[ChangeField.STATUS]:
            if until is not None and t.at > until:
                break
            if order(self._status(t.to_id, t.to_value)) < order(self._status(t.from_id, t.from_value)):
                count += 1
        return count

    # ------------------------------------------------------------------ other fields

    def _value_at(
        self, field: ChangeField, at: datetime, current: tuple[str | None, str | None]
    ) -> tuple[str | None, str | None]:
        changes = self._by_field[field]
        if not changes:
            return current
        before = [t for t in changes if t.at <= at]
        if before:
            return before[-1].to_id, before[-1].to_value
        return changes[0].from_id, changes[0].from_value

    def assignee_at(self, at: datetime) -> Person | None:
        current = (
            (self.issue.assignee.account_id, self.issue.assignee.display_name)
            if self.issue.assignee
            else (None, None)
        )
        account_id, name = self._value_at(ChangeField.ASSIGNEE, at, current)
        if not account_id:
            return None
        return Person(account_id=account_id, display_name=name or account_id)

    def sprints_at(self, at: datetime) -> frozenset[int]:
        changes = self._by_field[ChangeField.SPRINT]
        if not changes:
            return frozenset(self.issue.sprint_ids) if at >= self.issue.created else frozenset()
        raw_id, _ = self._value_at(ChangeField.SPRINT, at, (None, None))
        return parse_sprint_ids(raw_id)

    def all_sprints(self) -> frozenset[int]:
        ids: set[int] = set(self.issue.sprint_ids)
        for t in self._by_field[ChangeField.SPRINT]:
            ids |= parse_sprint_ids(t.from_id) | parse_sprint_ids(t.to_id)
        return frozenset(ids)

    def in_sprint_at(self, sprint_id: int, at: datetime) -> bool:
        return at >= self.issue.created and sprint_id in self.sprints_at(at)

    def estimate_at(self, at: datetime) -> float | None:
        current = (None, None if self.issue.estimate is None else str(self.issue.estimate))
        _, value = self._value_at(ChangeField.ESTIMATE, at, current)
        return parse_estimate(value)

    def flagged_at(self, at: datetime) -> bool:
        current = (None, "Impediment" if self.issue.flagged else None)
        _, value = self._value_at(ChangeField.FLAGGED, at, current)
        return bool(value and value.strip())

    def flagged_time(self, start: datetime, end: datetime) -> timedelta:
        changes = self._by_field[ChangeField.FLAGGED]
        if not changes:
            if self.issue.flagged:
                return max(end - max(start, self.issue.created), timedelta(0))
            return timedelta(0)
        total = timedelta(0)
        flagged = bool((changes[0].from_value or "").strip())
        since = self.issue.created
        for t in changes:
            if flagged:
                total += max(min(t.at, end) - max(since, start), timedelta(0))
            flagged = bool((t.to_value or "").strip())
            since = t.at
        if flagged:
            total += max(end - max(since, start), timedelta(0))
        return total
