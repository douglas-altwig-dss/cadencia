"""Days, weeks and the pieces the views draw, read off a schedule.

Weeks are numbered from execution: the week in which the first execution subtask starts is
**Semana 1**, the ones before it are −1, −2… and form the planning phase. Who works in them
follows from the subtasks, never from a fixed rule.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from cadencia.domain.epic_plan.graph import natural_key
from cadencia.domain.epic_plan.hours import hours_label
from cadencia.domain.epic_plan.model import Epic, Phase, Role
from cadencia.domain.epic_plan.schedule import Schedule, SchedulingProblem
from cadencia.i18n.message import Msg

DAYS_PER_WEEK = 5


@dataclass(frozen=True)
class Duration:
    planning_days: int
    execution_days: int

    @property
    def total_days(self) -> int:
        return self.planning_days + self.execution_days

    @property
    def label(self) -> Msg:
        """``Planejamento 6 d + Execução 1 d = Total 7 dias úteis`` in pt-BR (also the deck's
        ``plano.duracao``, which is built in the deck locale)."""
        return Msg(
            "epic_plan.duration",
            planning=self.planning_days,
            execution=self.execution_days,
            total=self.total_days,
        )

    def as_dict(self) -> dict[str, Any]:
        """``rotulo`` is ``$msg`` JSON: the view that embeds it ends with ``localize``."""
        return {
            "planejamento_dias": self.planning_days,
            "execucao_dias": self.execution_days,
            "total_dias": self.total_days,
            "rotulo": self.label.to_json(),
        }


def total_days(problem: SchedulingProblem, schedule: Schedule) -> int:
    return math.ceil(schedule.makespan / problem.slots_per_day)


def first_execution_slot(epic: Epic, schedule: Schedule) -> int | None:
    subtasks = epic.subtask_by_id
    starts = [
        a.start
        for a in schedule.allocations
        if (s := subtasks.get(a.subtask_id)) is not None and epic.phase_of(s) is Phase.EXECUTION
    ]
    return min(starts, default=None)


def duration(epic: Epic, problem: SchedulingProblem, schedule: Schedule) -> Duration:
    """Planning = the whole days before the day execution starts; execution = the rest."""
    total = total_days(problem, schedule)
    first = first_execution_slot(epic, schedule)
    planning = total if first is None else min(first // problem.slots_per_day, total)
    return Duration(planning, total - planning)


def execution_week(epic: Epic, problem: SchedulingProblem, schedule: Schedule) -> int:
    """0-based index (from the plan's first Monday) of the week labelled Semana 1."""
    first = first_execution_slot(epic, schedule)
    if first is None:
        return math.ceil(total_days(problem, schedule) / DAYS_PER_WEEK)
    return first // problem.slots_per_day // DAYS_PER_WEEK


def week_number(index: int, first_execution_week: int) -> int:
    """0-based week index → the label: 1, 2… from execution on, −1, −2… before it (never 0)."""
    offset = index - first_execution_week
    return offset + 1 if offset >= 0 else offset


def weeks(
    epic: Epic, problem: SchedulingProblem, schedule: Schedule, roles: Sequence[Role]
) -> list[dict[str, Any]]:
    """Every week the plan spans, with the roles that work in it (planning weeks name them)."""
    per_week = problem.slots_per_day * DAYS_PER_WEEK
    count = max(1, math.ceil(total_days(problem, schedule) / DAYS_PER_WEEK))
    first_exec = execution_week(epic, problem, schedule)
    order = {r.id: i for i, r in enumerate(roles)}
    names = {r.id: r.name for r in roles}
    working: dict[int, set[int]] = defaultdict(set)
    for allocation in schedule.allocations:
        if allocation.end <= allocation.start:
            continue
        for week in range(allocation.start // per_week, (allocation.end - 1) // per_week + 1):
            working[week].add(allocation.role_id)
    return [
        {
            "indice": index,
            "semana": week_number(index, first_exec),
            "planejamento": index < first_exec,
            "papeis": [
                names[r] for r in sorted(working[index], key=lambda r: order.get(r, 999)) if r in names
            ],
        }
        for index in range(count)
    ]


def task_segments(epic: Epic, problem: SchedulingProblem, schedule: Schedule) -> list[dict[str, Any]]:
    """One bar per (task, role), holding only that role's hours on the task. Where the role's
    subtasks of the task leave a gap in time, the bar is split into parts rather than stretched
    across it, so its length is always time actually worked."""
    subtasks = epic.subtask_by_id
    grouped: dict[tuple[str, int], list[tuple[int, int, str]]] = defaultdict(list)
    for allocation in schedule.allocations:
        subtask = subtasks.get(allocation.subtask_id)
        if subtask is None or allocation.end <= allocation.start:
            continue
        grouped[(subtask.task_id, allocation.role_id)].append(
            (allocation.start, allocation.end, allocation.subtask_id)
        )
    step = problem.params.slot_hours
    out: list[dict[str, Any]] = []
    for (task_id, role_id), pieces in grouped.items():
        pieces.sort()
        current: list[tuple[int, int, str]] = [pieces[0]]
        parts: list[list[tuple[int, int, str]]] = [current]
        for piece in pieces[1:]:
            if piece[0] <= max(p[1] for p in current):
                current.append(piece)
            else:
                current = [piece]
                parts.append(current)
        for part in parts:
            start = min(p[0] for p in part)
            end = max(p[1] for p in part)
            hours = round(sum(subtasks[p[2]].hours for p in part), 4)
            out.append(
                {
                    "tarefa_id": task_id,
                    "papel_id": role_id,
                    "inicio": round(start * step, 4),
                    "fim": round(end * step, 4),
                    "horas": hours,
                    "rotulo": hours_label(
                        round((end - start) * step, 4), problem.params.workday_hours
                    ).to_json(),
                    "subtarefas": sorted({p[2] for p in part}, key=natural_key),
                }
            )
    return sorted(out, key=lambda s: (s["inicio"], natural_key(s["tarefa_id"]), s["papel_id"]))


def weekly_load(epic: Epic, problem: SchedulingProblem, schedule: Schedule) -> dict[str, dict[int, float]]:
    """Hours each worker is busy per week (week label → hours)."""
    per_week = problem.slots_per_day * DAYS_PER_WEEK
    first_exec = execution_week(epic, problem, schedule)
    step = problem.params.slot_hours
    out: dict[str, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for allocation in schedule.allocations:
        for slot in range(allocation.start, allocation.end):
            out[allocation.worker_id][week_number(slot // per_week, first_exec)] += step
    return {w: {k: round(v, 4) for k, v in sorted(weeks.items())} for w, weeks in out.items()}
