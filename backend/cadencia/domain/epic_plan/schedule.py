"""The time model, the plan validator and list scheduling.

**Time is counted in slots of working time** (``Parameters.slot_hours``, 0.5 h by default), from
slot 0 = the first hour of the plan's first Monday. Everybody works the same Monday-to-Friday
workday, so ``slots_per_day`` consecutive slots are one day and "continuous working hours of the
same person, possibly across midnight" is simply a contiguous interval on this line. That turns
the baseline, list scheduling, the MILP and CP-SAT into the same multi-skill resource-constrained
project scheduling problem (MS-RCPSP); days and weeks only matter when the result is drawn.

A **worker** is a real member or, for the baseline, one virtual person per role.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from itertools import pairwise
from typing import Any

from cadencia.domain.epic_plan.graph import natural_key, subtask_cycles, tails
from cadencia.domain.epic_plan.model import Epic, Member, Parameters, Problem, Role
from cadencia.errors import Invalid
from cadencia.i18n.message import Msg

EPSILON = 1e-6


@dataclass(frozen=True)
class Worker:
    id: str
    name: str
    roles: frozenset[int]
    virtual: bool = False

    @property
    def sort_key(self) -> tuple[object, ...]:
        return (self.name.casefold(), self.id)


def member_workers(members: Iterable[Member]) -> list[Worker]:
    return sorted((Worker(m.id, m.name, m.role_ids) for m in members if m.role_ids), key=lambda w: w.sort_key)


def baseline_workers(roles: Sequence[Role]) -> list[Worker]:
    """One virtual person per role: the reference the plan's gain is measured against."""
    return [Worker(f"papel:{r.id}", r.name, frozenset({r.id}), virtual=True) for r in roles]


@dataclass(frozen=True)
class Allocation:
    subtask_id: str
    worker_id: str
    role_id: int
    start: int  # slot
    end: int  # slot, exclusive


@dataclass(frozen=True)
class Schedule:
    allocations: tuple[Allocation, ...]

    @property
    def makespan(self) -> int:
        return max((a.end for a in self.allocations), default=0)

    def by_subtask(self) -> dict[str, list[Allocation]]:
        out: dict[str, list[Allocation]] = defaultdict(list)
        for allocation in self.allocations:
            out[allocation.subtask_id].append(allocation)
        return out

    def by_worker(self) -> dict[str, list[Allocation]]:
        out: dict[str, list[Allocation]] = defaultdict(list)
        for allocation in sorted(self.allocations, key=lambda a: (a.start, a.end)):
            out[allocation.worker_id].append(allocation)
        return out

    def to_contract(self, params: Parameters) -> list[dict[str, Any]]:
        """The API's shape: ``inicio``/``fim`` in working hours since the start of the plan."""
        step = params.slot_hours
        return [
            {
                "subtarefa_id": a.subtask_id,
                "membro_id": a.worker_id,
                "papel_id": a.role_id,
                "inicio": round(a.start * step, 4),
                "fim": round(a.end * step, 4),
            }
            for a in sorted(self.allocations, key=lambda a: (a.start, natural_key(a.subtask_id), a.role_id))
        ]

    @classmethod
    def from_contract(cls, rows: Iterable[Mapping[str, Any]], params: Parameters) -> Schedule:
        step = params.slot_hours
        return cls(
            tuple(
                Allocation(
                    str(r["subtarefa_id"]),
                    str(r["membro_id"]),
                    int(r["papel_id"]),
                    round(float(r["inicio"]) / step),
                    round(float(r["fim"]) / step),
                )
                for r in rows
            )
        )


def duration_slots(hours: float, params: Parameters) -> int:
    return max(0, math.ceil(hours / params.slot_hours - EPSILON))


@dataclass(frozen=True)
class SchedulingProblem:
    params: Parameters
    subtasks: tuple[str, ...]
    duration: Mapping[str, int]
    roles: Mapping[str, tuple[int, ...]]
    preds: Mapping[str, tuple[str, ...]]
    workers: tuple[Worker, ...]

    def candidates(self, role_id: int) -> list[Worker]:
        return [w for w in self.workers if role_id in w.roles]

    @property
    def slots_per_day(self) -> int:
        return self.params.slots_per_day

    def fingerprint(self) -> str:
        """What a stored plan was built from; any change to it makes that plan stale."""
        payload = {
            "p": [self.params.workday_hours, self.params.slot_hours],
            "s": [[s, self.duration[s], list(self.roles[s]), list(self.preds[s])] for s in self.subtasks],
            "w": [[w.id, sorted(w.roles)] for w in self.workers],
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:32]


def blocking_problems(epic: Epic, workers: Sequence[Worker], roles: Sequence[Role]) -> list[Problem]:
    """Why no schedule can be built for these people, naming the subtasks involved. Empty = go."""
    problems = list(epic.errors)
    for cycle in subtask_cycles(epic):
        problems.append(
            Problem(
                "erro",
                "ciclo",
                Msg("epic_plan.problem.cycle", path=" → ".join((*cycle, cycle[0]))),
                cycle,
            )
        )
    names = {r.id: r.name for r in roles}
    covered: dict[int, set[str]] = defaultdict(set)
    for worker in workers:
        for role_id in worker.roles:
            covered[role_id].add(worker.id)
    missing: dict[int, list[str]] = defaultdict(list)
    impossible: list[str] = []
    for subtask in epic.subtasks:
        for role_id in subtask.roles:
            if not covered[role_id]:
                missing[role_id].append(subtask.id)
        if subtask.composite and all(covered[r] for r in subtask.roles):
            first, second = subtask.roles
            if len(covered[first] | covered[second]) < 2:
                impossible.append(subtask.id)
    for role_id, subtasks in missing.items():
        problems.append(
            Problem(
                "erro",
                "papel_sem_membro",
                Msg(
                    "epic_plan.problem.role_without_member",
                    role=str(names.get(role_id, role_id)),
                    keys=subtasks,
                ),
                tuple(subtasks),
            )
        )
    if impossible:
        problems.append(
            Problem(
                "erro",
                "composta_sem_par",
                Msg("epic_plan.problem.composite_without_pair", keys=impossible),
                tuple(impossible),
            )
        )
    return problems


def build_problem(
    epic: Epic, params: Parameters, workers: Sequence[Worker], roles: Sequence[Role]
) -> SchedulingProblem:
    problems = blocking_problems(epic, workers, roles)
    if problems:
        raise Invalid(Msg("epic_plan.problems", items=[p.message for p in problems]))
    ordered = sorted(epic.subtasks, key=lambda s: natural_key(s.id))
    known = {s.id for s in ordered}
    return SchedulingProblem(
        params=params,
        subtasks=tuple(s.id for s in ordered),
        duration={s.id: duration_slots(s.hours, params) for s in ordered},
        roles={s.id: tuple(dict.fromkeys(s.roles)) for s in ordered},
        preds={s.id: tuple(p for p in s.prerequisites if p in known and p != s.id) for s in ordered},
        workers=tuple(sorted(workers, key=lambda w: w.sort_key)),
    )


# ---------------------------------------------------------------------------------- validator


def validate(problem: SchedulingProblem, schedule: Schedule) -> list[Msg]:
    """Every rule of the agenda, checked on a finished plan — whoever produced it."""
    errors: list[Msg] = []
    workers = {w.id: w for w in problem.workers}
    by_subtask = schedule.by_subtask()
    for unknown in sorted(set(by_subtask) - set(problem.subtasks), key=natural_key):
        errors.append(Msg("epic_plan.violation.unknown_subtask", key=unknown))
    for sid in problem.subtasks:
        allocations = by_subtask.get(sid, [])
        needed = sorted(problem.roles[sid])
        if sorted(a.role_id for a in allocations) != needed:
            errors.append(Msg("epic_plan.violation.roles_once", key=sid))
            continue
        if len({a.worker_id for a in allocations}) != len(allocations):
            errors.append(Msg("epic_plan.violation.same_person", key=sid))
        if len({(a.start, a.end) for a in allocations}) != 1:
            errors.append(Msg("epic_plan.violation.not_together", key=sid))
        for allocation in allocations:
            worker = workers.get(allocation.worker_id)
            if worker is None:
                errors.append(Msg("epic_plan.violation.not_selected", key=sid, worker=allocation.worker_id))
            elif allocation.role_id not in worker.roles:
                errors.append(Msg("epic_plan.violation.lacks_role", key=sid, worker=worker.name))
            if allocation.start < 0 or allocation.end - allocation.start != problem.duration[sid]:
                errors.append(Msg("epic_plan.violation.duration", key=sid))
    starts = {sid: min(a.start for a in al) for sid, al in by_subtask.items()}
    ends = {sid: max(a.end for a in al) for sid, al in by_subtask.items()}
    for sid in problem.subtasks:
        for pred in problem.preds[sid]:
            if sid in starts and pred in ends and starts[sid] < ends[pred]:
                errors.append(Msg("epic_plan.violation.prerequisite", key=sid, prerequisite=pred))
    per_day = problem.slots_per_day
    for worker_id, allocations in schedule.by_worker().items():
        name = workers[worker_id].name if worker_id in workers else worker_id
        busy = [a for a in allocations if a.end > a.start]
        for first, second in pairwise(busy):
            if second.start < first.end:
                errors.append(
                    Msg(
                        "epic_plan.violation.overlap",
                        name=name,
                        first=first.subtask_id,
                        second=second.subtask_id,
                    )
                )
        load: dict[int, int] = defaultdict(int)
        for allocation in busy:
            for slot in range(allocation.start, allocation.end):
                load[slot // per_day] += 1
        for day, slots in sorted(load.items()):
            if slots > per_day:
                errors.append(Msg("epic_plan.violation.workday", name=name, day=day + 1))
    return errors


# ---------------------------------------------------------------------------------- list scheduling


def list_schedule(problem: SchedulingProblem) -> Schedule:
    """Greedy list scheduling, deterministic.

    The ready subtask with the longest remaining critical path goes first (ties by id). It goes to
    the compatible person who is free earliest; between people free at the same time, the one who
    covers fewer roles, so floating capacity stays available. A composite subtask takes the pair
    of *different* people that lets it start earliest.
    """
    remaining = tails(problem.duration, problem.preds)
    free = {w.id: 0 for w in problem.workers}
    finished: dict[str, int] = {}
    pending = list(problem.subtasks)
    allocations: list[Allocation] = []
    while pending:
        ready = [s for s in pending if all(p in finished for p in problem.preds[s])]
        if not ready:
            raise Invalid(Msg("epic_plan.problem.cycle", path=", ".join(pending)))
        sid = min(ready, key=lambda s: (-remaining[s], natural_key(s)))
        pending.remove(sid)
        release = max((finished[p] for p in problem.preds[sid]), default=0)
        roles = problem.roles[sid]
        chosen: list[tuple[Worker, int]]
        if len(roles) == 1:
            worker = min(
                problem.candidates(roles[0]),
                key=lambda w: (max(free[w.id], release), len(w.roles), w.sort_key),
            )
            chosen = [(worker, roles[0])]
        else:
            first, second = roles
            pairs = [
                (a, b) for a in problem.candidates(first) for b in problem.candidates(second) if a.id != b.id
            ]
            a, b = min(
                pairs,
                key=lambda p: (
                    max(free[p[0].id], free[p[1].id], release),
                    len(p[0].roles) + len(p[1].roles),
                    p[0].sort_key,
                    p[1].sort_key,
                ),
            )
            chosen = [(a, first), (b, second)]
        start = max(release, *(free[w.id] for w, _ in chosen))
        end = start + problem.duration[sid]
        for worker, role_id in chosen:
            allocations.append(Allocation(sid, worker.id, role_id, start, end))
            if end > start:
                free[worker.id] = end
        finished[sid] = end
    return Schedule(tuple(allocations))


def lower_bound(problem: SchedulingProblem) -> int:
    """No plan can be shorter than this: the critical path, or the busiest role's work spread over
    everybody who covers it, or all the work spread over everybody."""
    path = max(tails(problem.duration, problem.preds).values(), default=0)
    total = sum(problem.duration[s] * len(problem.roles[s]) for s in problem.subtasks)
    bound = max(path, math.ceil(total / max(len(problem.workers), 1)))
    per_role: dict[int, int] = defaultdict(int)
    for sid in problem.subtasks:
        for role_id in problem.roles[sid]:
            per_role[role_id] += problem.duration[sid]
    for role_id, work in per_role.items():
        people = len(problem.candidates(role_id))
        if people:
            bound = max(bound, math.ceil(work / people))
    return bound
