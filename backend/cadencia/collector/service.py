"""Collection from Jira into the store (RF-01 … RF-04, RF-13, RF-14).

- Boards are collected concurrently; a failing board is recorded as failed and never stops the
  others (partial failure is visible in the UI, never silent).
- Incremental runs fetch only issues updated since the last *successful* run of that board (with
  an overlap margin, using relative JQL so the Jira profile time zone does not matter). A full
  reconciliation runs on the first collection and once per sprint.
- Every write is an idempotent upsert: an interrupted run is repaired by running again.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import math
import time
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from cadencia.analytics.data import invalidate, load_board
from cadencia.collector.snapshots import record_checkpoints, record_commitments
from cadencia.config import Settings
from cadencia.domain.models import Issue, Sprint
from cadencia.jira.client import JiraClient
from cadencia.jira.errors import JiraError
from cadencia.jira.fields import FieldMap, discover_fields
from cadencia.jira.mapping import (
    board_from,
    columns_from,
    issue_from_payload,
    space_from,
    sprint_from,
    status_from,
    transitions_from_changelog,
)
from cadencia.logging import log_context, log_event, new_run_id, timed
from cadencia.store import repo
from cadencia.store.db import session_scope

log = logging.getLogger(__name__)
KEY_BATCH = 100
#: Slack on the "updated within history_days" edge, so an item crossing it during the run stays put.
LEFT_BOARD_MARGIN = timedelta(days=1)
#: One collection at a time across the API and the scheduler. The holder renews well inside the TTL,
#: so a live collection never loses it and a dead one frees it within minutes.
COLLECT_LEASE = "collect"
LEASE_TTL = timedelta(minutes=10)
LEASE_RENEW = timedelta(minutes=2)
LEASE_POLL_SECONDS = 15.0


def utcnow() -> datetime:
    return datetime.now(UTC)


class CollectionCancelled(Exception):
    """Somebody pressed "cancelar" (RF-82). Raised between steps, never mid-write."""


#: How often, at most, the changelog phase reports its progress: often enough to watch, rarely
#: enough that a board of thousands of items does not write thousands of rows.
PROGRESS_EVERY = 1.5


@dataclass(frozen=True)
class BoardTask:
    id: int
    name: str
    type: str
    last_success_at: datetime | None
    last_full_at: datetime | None


class Collector:
    def __init__(
        self,
        client: JiraClient,
        sessions: sessionmaker[Session],
        settings: Settings,
        *,
        now: Callable[[], datetime] = utcnow,
    ) -> None:
        self.client = client
        self.sessions = sessions
        self.settings = settings
        self.now = now
        self._stop: set[str] = set()  # runs a cancel was seen for
        self._full: dict[tuple[str, int], bool] = {}  # full or incremental, once each board knows

    # ------------------------------------------------------------ connection & discovery

    async def test_connection(self) -> dict[str, Any]:
        me = await self.client.myself()
        permissions = await self.client.my_permissions(("BROWSE_PROJECTS",))
        return {
            "ok": True,
            "identity": {
                "account_id": me.get("accountId"),
                "name": me.get("displayName"),
                "email": me.get("emailAddress"),
                "timezone": me.get("timeZone"),
            },
            "permissions": permissions,
            "read_only": True,
        }

    async def discover(self) -> dict[str, Any]:
        with timed(log, "descoberta"):
            me, fields, statuses, boards = await asyncio.gather(
                self.client.myself(), self.client.fields(), self.client.statuses(), self.client.boards()
            )
        field_map = discover_fields(fields)
        parsed_boards = [board_from(b) for b in boards]
        parsed_spaces = {sp.key: sp for b in boards if (sp := space_from(b)) is not None}
        parsed_statuses = [status_from(s) for s in statuses]
        with session_scope(self.sessions) as session:
            repo.save_field_map(session, field_map)
            repo.upsert_statuses(session, parsed_statuses)
            repo.upsert_spaces(session, parsed_spaces.values(), self.now())
            repo.upsert_boards(session, parsed_boards, self.now())
            effective = repo.load_field_map(session)
            overrides = repo.field_overrides(session)
        return {
            "identity": {"account_id": me.get("accountId"), "name": me.get("displayName")},
            "field_map": field_map.as_dict(),
            "overrides": overrides,
            "effective_field_map": effective.as_dict(),
            "missing_fields": effective.missing(),
            "spaces": [
                {"key": sp.key, "name": sp.name}
                for sp in sorted(parsed_spaces.values(), key=lambda sp: sp.name.casefold())
            ],
            "boards": [
                {"id": b.id, "name": b.name, "type": b.type, "space_key": b.space_key}
                for b in sorted(parsed_boards, key=lambda b: b.name.casefold())
            ],
            "statuses": [{"id": s.id, "name": s.name, "category": s.category.value} for s in parsed_statuses],
        }

    # ------------------------------------------------------------ collection

    async def collect(
        self,
        *,
        mode: str = "incremental",
        board_ids: Iterable[int] | None = None,
        run_id: str | None = None,
        wait: timedelta | None = None,
    ) -> dict[str, Any]:
        """Collect under the collection lease, or answer ``skipped`` if another one holds it.

        ``run_id`` lets a caller that already took the lease (the API, before answering 202) hand it
        over; ``wait`` lets a checkpoint queue behind a running collection instead of skipping it.
        """
        run_id = run_id or new_run_id()
        if not await self._take_lease(run_id, wait):
            with session_scope(self.sessions) as session:
                holder = repo.lease_holder(session, COLLECT_LEASE)
            log_event(log, "coleta ignorada: outra em andamento", mode=mode, holder=holder)
            return {"run_id": run_id, "status": "skipped", "holder": holder, "boards": [], "counters": {}}
        keeper = asyncio.create_task(self._keep_lease(run_id))
        try:
            return await self._collect(mode, board_ids, run_id)
        finally:
            keeper.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await keeper
            with session_scope(self.sessions) as session:
                repo.release_lease(session, COLLECT_LEASE, run_id)
                repo.clear_cancel(session, run_id)

    async def _take_lease(self, holder: str, wait: timedelta | None) -> bool:
        deadline = time.monotonic() + (wait.total_seconds() if wait else 0)
        while True:
            with session_scope(self.sessions) as session:
                if repo.acquire_lease(session, COLLECT_LEASE, holder, LEASE_TTL):
                    return True
            if time.monotonic() >= deadline:
                return False
            await asyncio.sleep(LEASE_POLL_SECONDS)

    async def _keep_lease(self, holder: str) -> None:
        while True:
            await asyncio.sleep(LEASE_RENEW.total_seconds())
            with session_scope(self.sessions) as session:
                renewed = repo.acquire_lease(session, COLLECT_LEASE, holder, LEASE_TTL)
            if not renewed:  # it expired and someone else took it: we now overlap, so say so
                log_event(log, "lease da coleta perdido", level=logging.WARNING, holder=holder)

    async def _collect(self, mode: str, board_ids: Iterable[int] | None, run_id: str) -> dict[str, Any]:
        wanted = set(board_ids or [])
        with log_context(run_id=run_id, mode=mode):
            with session_scope(self.sessions) as session:
                repo.start_run(session, run_id, mode)
                field_map = repo.load_field_map(session)
                needs_discovery = not field_map.sprint and not field_map.story_points
            if needs_discovery:
                await self.discover()
                with session_scope(self.sessions) as session:
                    field_map = repo.load_field_map(session)
            with session_scope(self.sessions) as session:
                rows = repo.selected_boards(session)
                tasks = [
                    BoardTask(r.id, r.name, r.type, r.last_success_at, r.last_full_at)
                    for r in rows
                    if not wanted or r.id in wanted
                ]
            if not tasks:
                with session_scope(self.sessions) as session:
                    repo.finish_run(
                        session, run_id, "empty", self.client.counters.as_dict(), "nenhum board selecionado"
                    )
                return {
                    "run_id": run_id,
                    "status": "empty",
                    "boards": [],
                    "counters": self.client.counters.as_dict(),
                }

            statuses = await self.client.statuses()
            with session_scope(self.sessions) as session:
                repo.upsert_statuses(session, [status_from(s) for s in statuses])

            results = await asyncio.gather(*(self._collect_board(run_id, t, mode, field_map) for t in tasks))
            ok = sum(1 for r in results if r["status"] == "success")
            status = "success" if ok == len(results) else ("partial" if ok else "failed")
            if any(r["status"] == "cancelled" for r in results):
                status = "cancelled"
            counters = {**self.client.counters.as_dict(), "boards": len(results), "boards_ok": ok}
            with session_scope(self.sessions) as session:
                repo.finish_run(session, run_id, status, counters)
            invalidate()
            log_event(log, "coleta concluída", status=status, boards=len(results), boards_ok=ok)
            return {"run_id": run_id, "status": status, "boards": results, "counters": counters}

    def _needs_full(self, task: BoardTask, sprints: Sequence[Sprint], mode: str) -> bool:
        if mode == "full" or task.last_success_at is None or task.last_full_at is None:
            return True
        active = [s.start for s in sprints if s.state == "active" and s.start]
        return bool(active) and max(active) > task.last_full_at  # once per sprint

    def _relevant_sprints(self, sprints: Sequence[Sprint]) -> list[Sprint]:
        closed = sorted(
            (s for s in sprints if s.state == "closed"),
            key=lambda s: s.complete or s.end or s.start or datetime.min.replace(tzinfo=UTC),
        )
        return [s for s in sprints if s.state in {"active", "future"}] + closed[
            -self.settings.history_sprints :
        ]

    async def _collect_board(
        self, run_id: str, task: BoardTask, mode: str, field_map: FieldMap
    ) -> dict[str, Any]:
        started = self.now()
        counters: dict[str, Any] = {"issues": 0, "parents": 0, "changelogs": 0, "sprints": 0, "snapshots": 0}
        with log_context(board=task.id, board_name=task.name):
            with session_scope(self.sessions) as session:
                repo.start_board_run(session, run_id, task.id)
            full = False
            try:
                self._phase(run_id, task.id, "configuracao")
                with timed(log, "configuracao"):
                    columns = columns_from(await self.client.board_configuration(task.id))
                sprints: list[Sprint] = []
                if task.type == "scrum":
                    sprints = [sprint_from(s, task.id) for s in await self.client.sprints(task.id)]
                counters["sprints"] = len(sprints)
                full = self._needs_full(task, sprints, mode)
                counters["full"] = full  # for the next run's ETA, which compares like with like
                self._full[(run_id, task.id)] = full
                fields = field_map.issue_fields()

                self._phase(run_id, task.id, "itens")
                with timed(log, "itens", full=full):
                    if full:
                        jql = f"statusCategory != Done OR updated >= -{self.settings.history_days}d"
                        raw = await self.client.board_issues(task.id, fields, jql)
                        for sprint in self._relevant_sprints(sprints):
                            raw += await self.client.sprint_issues(sprint.id, fields)
                    else:
                        assert task.last_success_at is not None
                        elapsed = (started - task.last_success_at).total_seconds() / 60
                        minutes = math.ceil(elapsed) + self.settings.incremental_overlap_minutes
                        raw = await self.client.board_issues(task.id, fields, f"updated >= -{minutes}m")
                issues = list({i.key: i for i in (issue_from_payload(r, field_map) for r in raw)}.values())
                counters["issues"] = len(issues)

                # RF-111: an epic's own parent (an initiative) is one hop further than a board
                # item's own epic — keep climbing until nothing new turns up, so a work tree never
                # has to fall back to "KEY (fora do escopo coletado)" for a title the API could
                # have just fetched. Bounded rather than infinite in case Jira's own hierarchy ever
                # turned out to cycle; five hops is more than any real instance goes.
                parents = await self._missing_parents(issues, fields, field_map)
                frontier = parents
                for _ in range(5):
                    if not frontier:
                        break
                    frontier = await self._missing_parents(frontier, fields, field_map)
                    parents += frontier
                counters["parents"] = len(parents)

                with timed(log, "historico", items=len(issues) + len(parents)):
                    everything = issues + parents
                    histories = await self._changelogs(run_id, task.id, everything)
                transitions = [
                    t
                    for issue, history in zip(everything, histories, strict=True)
                    for t in transitions_from_changelog(issue.key, history, field_map)
                ]
                counters["changelogs"] = len(everything)

                self._phase(run_id, task.id, "gravando")
                now = self.now()
                with session_scope(self.sessions) as session:
                    repo.save_board_columns(session, task.id, columns)
                    repo.upsert_sprints(session, sprints)
                    repo.upsert_issues(session, everything, task.id, now)
                    repo.upsert_transitions(session, transitions)
                    repo.mark_changelog_synced(session, [i.key for i in everything], now)
                    # An empty answer is likelier a lost permission than an emptied board.
                    if full and issues:
                        gone = self._left_the_board(session, task.id, everything, started)
                        repo.drop_board_members(session, task.id, gone)
                        counters["left_board"] = len(gone)
                        if gone:
                            log_event(log, "itens saíram do board", count=len(gone), keys=gone[:20])

                with session_scope(self.sessions) as session, timed(log, "snapshots"):
                    data = load_board(
                        session, task.id, repo.profile_defaults(self.settings), self.settings.history_days
                    )
                    counters["snapshots"] = record_checkpoints(session, data, now)
                    counters["commitments"] = record_commitments(session, data, now)

                with session_scope(self.sessions) as session:
                    repo.finish_board_run(
                        session,
                        run_id,
                        task.id,
                        status="success",
                        counters=counters,
                        started_at=started,
                        full=full,
                    )
                return {
                    "board_id": task.id,
                    "name": task.name,
                    "status": "success",
                    "full": full,
                    "counters": counters,
                }
            except CollectionCancelled:
                log_event(log, "coleta do board cancelada")
                return self._fail(
                    run_id,
                    task,
                    started,
                    counters,
                    "Coleta cancelada a pedido.",
                    "cancelada",
                    "Rode de novo quando quiser; nada foi gravado pela metade.",
                    full,
                    status="cancelled",
                )
            except JiraError as exc:
                log_event(
                    log, "falha na coleta do board", level=logging.ERROR, cause=exc.cause, error=exc.message
                )
                return self._fail(run_id, task, started, counters, exc.message, exc.cause, exc.action, full)
            except Exception as exc:
                log.exception("erro inesperado na coleta do board")
                return self._fail(
                    run_id,
                    task,
                    started,
                    counters,
                    str(exc),
                    "erro inesperado",
                    "Veja o log estruturado desta execução.",
                    full,
                )

    def _phase(
        self, run_id: str, board_id: int, phase: str, done: int | None = None, total: int | None = None
    ) -> None:
        """Record where this board is, and stop here if a cancel was asked for (RF-82)."""
        with session_scope(self.sessions) as session:
            repo.board_progress(
                session, run_id, board_id, phase, done, total, full=self._full.get((run_id, board_id))
            )
            cancelled = repo.cancel_requested(session, run_id)
        if cancelled:
            self._stop.add(run_id)
            raise CollectionCancelled

    async def _changelogs(self, run_id: str, board_id: int, issues: Sequence[Issue]) -> list[Any]:
        """Every item's changelog, concurrently, reporting progress and honouring a cancel."""
        total, done = len(issues), 0
        last = time.monotonic()
        self._phase(run_id, board_id, "historico", 0, total)

        async def one(issue: Issue) -> Any:
            nonlocal done, last
            if run_id in self._stop:  # a sibling saw the cancel: do not spend another call
                raise CollectionCancelled
            history = await self.client.changelog(issue.key)
            done += 1
            if time.monotonic() - last >= PROGRESS_EVERY:
                last = time.monotonic()
                self._phase(run_id, board_id, "historico", done, total)
            return history

        return list(await asyncio.gather(*(one(i) for i in issues)))

    def _left_the_board(
        self, session: Session, board_id: int, everything: Sequence[Issue], started: datetime
    ) -> list[str]:
        """Stored members a full reconciliation should have returned and did not.

        The full JQL returns every open item and every item updated within `history_days`, so a
        member matching that and missing from the answer was deleted, moved to another project
        (which gives it a new key) or dropped by the board's filter. Left in place it stayed open
        forever, went stale and aging, and inflated WIP. Parents are kept: they are here because a
        child is, not because the filter returns them. A re-appearing item is simply added back.
        """
        keep = {i.key for i in everything} | {i.parent_key for i in everything if i.parent_key}
        since = started - timedelta(days=self.settings.history_days) + LEFT_BOARD_MARGIN
        return sorted(repo.board_members_expected(session, board_id, since) - keep)

    def _fail(
        self,
        run_id: str,
        task: BoardTask,
        started: datetime,
        counters: dict[str, Any],
        message: str,
        cause: str,
        action: str,
        full: bool,
        *,
        status: str = "failed",
    ) -> dict[str, Any]:
        with session_scope(self.sessions) as session:
            repo.finish_board_run(
                session,
                run_id,
                task.id,
                status=status,
                counters=counters,
                started_at=started,
                full=full,
                error=message,
                cause=cause,
                action=action,
            )
        return {
            "board_id": task.id,
            "name": task.name,
            "status": status,
            "error": {"cause": cause, "action": action, "message": message},
            "counters": counters,
        }

    async def _missing_parents(
        self, issues: Sequence[Issue], fields: list[str], field_map: FieldMap
    ) -> list[Issue]:
        in_batch = {i.key for i in issues}
        wanted = {i.parent_key for i in issues if i.parent_key and i.parent_key not in in_batch}
        if not wanted:
            return []
        with session_scope(self.sessions) as session:
            known = repo.existing_issue_keys(session, wanted)
        # Refresh known parents too when their children changed: epic status/dates matter.
        keys = sorted(wanted)
        found: list[Issue] = []
        for i in range(0, len(keys), KEY_BATCH):
            chunk = keys[i : i + KEY_BATCH]
            try:
                raw = await self.client.search(f"key in ({','.join(chunk)})", fields)
            except JiraError as exc:
                if exc.status in (400, 403, 404):  # parent in a project the account cannot read
                    log_event(
                        log,
                        "pais inacessíveis ignorados",
                        level=logging.WARNING,
                        keys=len(chunk),
                        known=len(known),
                    )
                    continue
                raise
            found += [issue_from_payload(r, field_map) for r in raw]
        return found


async def run_collection(
    settings: Settings,
    sessions: sessionmaker[Session],
    *,
    mode: str = "incremental",
    board_ids: Iterable[int] | None = None,
    run_id: str | None = None,
    wait: timedelta | None = None,
) -> dict[str, Any]:
    async with JiraClient.from_settings(settings) as client:
        return await Collector(client, sessions, settings).collect(
            mode=mode, board_ids=board_ids, run_id=run_id, wait=wait
        )


async def run_discovery(settings: Settings, sessions: sessionmaker[Session]) -> dict[str, Any]:
    async with JiraClient.from_settings(settings) as client:
        return await Collector(client, sessions, settings).discover()


async def run_connection_test(settings: Settings, sessions: sessionmaker[Session]) -> dict[str, Any]:
    async with JiraClient.from_settings(settings, max_retries=1) as client:
        return await Collector(client, sessions, settings).test_connection()
