"""Board data loaded from the store and turned into domain timelines.

The UI never talks to Jira: every view is computed from this snapshot of the database. Loaded
boards are cached in-process and invalidated whenever the board's data version changes.
"""

from __future__ import annotations

import json
import threading
from collections import OrderedDict
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from cadencia.domain.calendar import profile_checkpoints
from cadencia.domain.history import IssueHistory
from cadencia.domain.metrics import ItemMetrics, aging_thresholds, item_metrics
from cadencia.domain.models import Board, BoardProfile, HierarchyLevel, Issue, Sprint, Status
from cadencia.domain.risk import RiskAssessment, RiskContext, assess
from cadencia.errors import NotFound
from cadencia.i18n import Msg, stored_text
from cadencia.store import repo
from cadencia.store import schema as s

STALE_AFTER = timedelta(hours=26)
CHECKPOINT_LOOKBACK = timedelta(weeks=26)
#: Instants remembered per board. A cached board lives until its data changes, which on a quiet
#: board is days, and every request asks about its own "now": unbounded, this grew per request.
MEMO_SIZE = 16


@dataclass
class BoardData:
    board: Board
    profile: BoardProfile
    sprints: dict[int, Sprint]
    issues: dict[str, Issue]
    histories: dict[str, IssueHistory]
    statuses: dict[str, Status] = field(default_factory=dict)
    last_success_at: datetime | None = None
    last_full_at: datetime | None = None
    #: The pt-BR text stored for the last failure; ``last_error_record`` is the same failure as
    #: ``$msg`` records. The cache is shared by requests in every language, so it holds the record and
    #: ``freshness()`` renders it for whoever asks (R3).
    last_error: str | None = None
    last_error_record: dict[str, Any] | None = None
    last_error_at: datetime | None = None
    history_days: int = 120
    _memo: OrderedDict[Any, Any] = field(default_factory=OrderedDict, repr=False)
    _memo_lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    # ---- scopes

    def work_items(self) -> list[IssueHistory]:
        return [h for h in self.histories.values() if h.issue.hierarchy_level == HierarchyLevel.STANDARD]

    def trackable(self) -> list[IssueHistory]:
        """Everything below epic level: stories, tasks, bugs and subtasks."""
        return [h for h in self.histories.values() if h.issue.hierarchy_level < HierarchyLevel.EPIC]

    def sprint_members(self, sprint_id: int, at: datetime | None = None) -> list[IssueHistory]:
        out = []
        for h in self.histories.values():
            if at is None:
                if sprint_id in h.all_sprints():
                    out.append(h)
            elif h.in_sprint_at(sprint_id, at):
                out.append(h)
        return sorted(out, key=lambda h: (h.issue.rank or "~", h.issue.key))

    def open_items(self, at: datetime) -> list[IssueHistory]:
        return [h for h in self.trackable() if h.status_at(at) is not None and not h.is_done_at(at)]

    # ---- sprints

    def current_sprint(self, now: datetime) -> Sprint | None:
        active = [s for s in self.sprints.values() if s.state == "active" and s.start and s.start <= now]
        if active:
            return max(active, key=lambda s: s.start or now)
        closed = [s for s in self.sprints.values() if s.state == "closed"]
        if closed:
            return max(closed, key=lambda s: s.complete or s.end or s.start or now)
        return None

    def sprint_at(self, at: datetime) -> Sprint | None:
        candidates = []
        for sprint in self.sprints.values():
            if sprint.start is None or sprint.start > at:
                continue
            end = sprint.complete or sprint.end
            if end is None or at <= end + timedelta(days=3):
                candidates.append(sprint)
        if candidates:
            return max(candidates, key=lambda s: s.start or at)
        return self.current_sprint(at)

    def closed_sprints(self, before: datetime, limit: int = 6) -> list[Sprint]:
        closed = [
            s
            for s in self.sprints.values()
            if s.state == "closed" and (s.complete or s.end or before) <= before
        ]
        closed.sort(key=lambda s: s.complete or s.end or before)
        return closed[-limit:]

    def reference_for(self, sprint: Sprint, now: datetime) -> datetime:
        if sprint.state == "closed":
            end = sprint.complete or sprint.end
            if end is not None:
                return min(now, end)
        return now

    # ---- derived, memoised per instant

    def _memoised(self, key: Any, build: Callable[[], Any]) -> Any:
        """The last `MEMO_SIZE` answers. The instance is shared by request threads, so the memo is
        locked, but `build` runs outside the lock: it may call back in here, and two threads
        building the same answer at once only waste a little work."""
        with self._memo_lock:
            if key in self._memo:
                self._memo.move_to_end(key)
                return self._memo[key]
        value = build()
        with self._memo_lock:
            self._memo[key] = value
            while len(self._memo) > MEMO_SIZE:
                self._memo.popitem(last=False)
        return value

    def completed_metrics(self, as_of: datetime) -> list[ItemMetrics]:
        def build() -> list[ItemMetrics]:
            since = as_of - timedelta(days=self.history_days)
            out = []
            for h in self.work_items():
                if not h.is_done_at(as_of):
                    continue
                metrics = item_metrics(h, self.profile, as_of)
                if metrics.done_at and metrics.done_at >= since:
                    out.append(metrics)
            return out

        return self._memoised(("completed", as_of), build)

    def risk_context(self, as_of: datetime) -> RiskContext:
        def build() -> RiskContext:
            thresholds = aging_thresholds(self.completed_metrics(as_of), self.profile.aging_percentile)

            def blocker_done(issue_key: str) -> bool | None:
                history = self.histories.get(issue_key)
                return None if history is None else history.is_done_at(as_of)

            return RiskContext(
                profile=self.profile,
                as_of=as_of,
                checkpoints=profile_checkpoints(self.profile, as_of - CHECKPOINT_LOOKBACK, as_of),
                sprints=self.sprints,
                aging_thresholds=thresholds,
                blocker_done=blocker_done,
            )

        return self._memoised(("ctx", as_of), build)

    def assess(self, histories: Iterable[IssueHistory], as_of: datetime) -> dict[str, RiskAssessment]:
        ctx = self.risk_context(as_of)
        return {h.issue.key: assess(h, ctx) for h in histories}

    def wip_columns(self) -> list[str]:
        out = []
        for column in self.profile.columns:
            statuses = [self.statuses[s] for s in column.status_ids if s in self.statuses]
            if any(self.profile.is_wip(s) for s in statuses):
                out.append(column.name)
        return out

    def freshness(self, now: datetime) -> dict[str, Any]:
        stale = self.last_success_at is None or now - self.last_success_at > STALE_AFTER
        return {
            "last_success_at": self.last_success_at,
            "last_full_at": self.last_full_at,
            "last_error": stored_text((self.last_error_record or {}).get("message"), self.last_error),
            "last_error_at": self.last_error_at,
            "stale": stale,
        }


_cache: dict[int, tuple[tuple[Any, ...], BoardData]] = {}
_lock = threading.Lock()


def _version(session: Session, row: s.BoardRow, defaults: Mapping[str, Any] | None) -> tuple[Any, ...]:
    stats = session.execute(
        select(func.count(), func.max(s.IssueRow.collected_at), func.max(s.IssueRow.changelog_synced_at))
        .select_from(s.IssueBoardRow)
        .join(s.IssueRow, s.IssueRow.key == s.IssueBoardRow.issue_key)
        .where(s.IssueBoardRow.board_id == row.id)
    ).one()
    sprint_stats = session.execute(
        select(func.count(), func.max(s.SprintRow.complete_at)).where(s.SprintRow.board_id == row.id)
    ).one()
    return (
        tuple(stats),
        tuple(sprint_stats),
        row.last_success_at,
        row.last_full_at,
        json.dumps(row.settings, sort_keys=True, default=str),
        json.dumps(row.columns, sort_keys=True),
        json.dumps(dict(defaults or {}), sort_keys=True, default=str),
    )


def load_board(
    session: Session, board_id: int, defaults: Mapping[str, Any] | None = None, history_days: int = 120
) -> BoardData:
    row = session.get(s.BoardRow, board_id)
    if row is None:
        raise NotFound(board_id, Msg("collect.board_unknown", board=board_id))
    version = _version(session, row, defaults)
    with _lock:
        cached = _cache.get(board_id)
        if cached and cached[0] == version:
            return cached[1]
    profile = repo.board_profile(session, board_id, defaults)
    sprints = {sp.id: sp for sp in repo.list_sprints(session, board_id)}
    issues = repo.load_issues(session, board_id=board_id)
    transitions = repo.load_transitions(session, [i.key for i in issues])
    statuses = repo.load_statuses(session)
    data = BoardData(
        board=repo.board_from_row(row),
        profile=profile,
        sprints=sprints,
        issues={i.key: i for i in issues},
        histories={i.key: IssueHistory(i, transitions.get(i.key, []), statuses) for i in issues},
        statuses=statuses,
        last_success_at=row.last_success_at,
        last_full_at=row.last_full_at,
        last_error=row.last_error,
        last_error_record=row.last_error_i18n,
        last_error_at=row.last_error_at,
        history_days=history_days,
    )
    with _lock:
        _cache[board_id] = (version, data)
    return data


def invalidate(board_id: int | None = None) -> None:
    with _lock:
        if board_id is None:
            _cache.clear()
        else:
            _cache.pop(board_id, None)
