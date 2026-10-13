"""Exact planners: MS-RCPSP as a MILP (HiGHS through OR-Tools MathOpt) and as CP-SAT.

Both take the list-scheduling plan as their starting point: its makespan is the horizon and its
assignment the hint, so a solver that runs out of time still answers with a plan no worse than the
greedy one. Both minimise the makespan in slots, under the rules ``schedule.validate`` checks.
OR-Tools is imported lazily: without it, these two are unavailable and everything else works.
"""

from __future__ import annotations

import time
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta

from cadencia.domain.epic_plan.schedule import (
    Allocation,
    Schedule,
    SchedulingProblem,
    list_schedule,
    lower_bound,
)

OPTIMAL = "otimo"
FEASIBLE = "viavel"
NO_SOLUTION = "sem_solucao"
HEURISTIC = "heuristico"


class SolverUnavailable(RuntimeError):
    """The solver library is not installed or could not start."""


@dataclass(frozen=True)
class SolveResult:
    status: str
    schedule: Schedule | None
    gap: float | None = None
    seconds: float = 0.0


def _gap(objective: float, bound: float) -> float:
    if objective <= 0:
        return 0.0
    return round(max(objective - bound, 0.0) / objective, 4)


def _reachable(problem: SchedulingProblem) -> dict[str, set[str]]:
    """Every subtask each one transitively waits on."""
    out: dict[str, set[str]] = {}

    def visit(node: str) -> set[str]:
        if node not in out:
            found: set[str] = set()
            for pred in problem.preds[node]:
                found.add(pred)
                found |= visit(pred)
            out[node] = found
        return out[node]

    for sid in problem.subtasks:
        visit(sid)
    return out


def _workers_of(problem: SchedulingProblem, sid: str) -> set[str]:
    return {w.id for role in problem.roles[sid] for w in problem.candidates(role)}


def _hint_maps(hint: Schedule) -> tuple[dict[str, int], dict[tuple[str, int], str]]:
    starts: dict[str, int] = {}
    who: dict[tuple[str, int], str] = {}
    for allocation in hint.allocations:
        starts[allocation.subtask_id] = allocation.start
        who[(allocation.subtask_id, allocation.role_id)] = allocation.worker_id
    return starts, who


def _schedule_from(
    problem: SchedulingProblem, starts: Mapping[str, int], chosen: Mapping[tuple[str, int], str]
) -> Schedule:
    return Schedule(
        tuple(
            Allocation(sid, chosen[(sid, role)], role, starts[sid], starts[sid] + problem.duration[sid])
            for sid in problem.subtasks
            for role in problem.roles[sid]
        )
    )


def solve_cpsat(problem: SchedulingProblem, seconds: float) -> SolveResult:
    try:
        from ortools.sat.python import cp_model
    except ImportError as exc:  # pragma: no cover - exercised only without OR-Tools
        raise SolverUnavailable("OR-Tools (CP-SAT) não está instalado no backend.") from exc
    began = time.monotonic()
    hint = list_schedule(problem)
    horizon = max(hint.makespan, 1)
    hint_start, hint_who = _hint_maps(hint)
    model = cp_model.CpModel()
    start = {
        sid: model.new_int_var(0, horizon - problem.duration[sid], f"s_{sid}") for sid in problem.subtasks
    }
    for sid in problem.subtasks:
        for pred in problem.preds[sid]:
            model.add(start[sid] >= start[pred] + problem.duration[pred])
    assign: dict[tuple[str, int, str], cp_model.IntVar] = {}
    per_worker: dict[str, list[cp_model.IntervalVar]] = {w.id: [] for w in problem.workers}
    for sid in problem.subtasks:
        size = problem.duration[sid]
        for role in problem.roles[sid]:
            literals = []
            for worker in problem.candidates(role):
                literal = model.new_bool_var(f"x_{sid}_{role}_{worker.id}")
                assign[(sid, role, worker.id)] = literal
                literals.append(literal)
                if size > 0:
                    per_worker[worker.id].append(
                        model.new_optional_fixed_size_interval_var(
                            start[sid], size, literal, f"i_{sid}_{role}_{worker.id}"
                        )
                    )
                model.add_hint(literal, hint_who.get((sid, role)) == worker.id)
            model.add_exactly_one(literals)
        if len(problem.roles[sid]) == 2:
            first, second = problem.roles[sid]
            for worker in problem.workers:
                pair = [assign.get((sid, first, worker.id)), assign.get((sid, second, worker.id))]
                if all(v is not None for v in pair):
                    model.add(sum(pair) <= 1)  # type: ignore[arg-type]
        model.add_hint(start[sid], hint_start[sid])
    for intervals in per_worker.values():
        if len(intervals) > 1:
            model.add_no_overlap(intervals)
    makespan = model.new_int_var(min(lower_bound(problem), horizon), horizon, "makespan")
    for sid in problem.subtasks:
        model.add(makespan >= start[sid] + problem.duration[sid])
    model.minimize(makespan)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(seconds)
    solver.parameters.num_workers = 8
    solver.parameters.random_seed = 0
    status = solver.solve(model)
    elapsed = round(time.monotonic() - began, 3)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult(NO_SOLUTION, None, None, elapsed)
    starts = {sid: int(solver.value(start[sid])) for sid in problem.subtasks}
    chosen = {
        (sid, role): worker_id
        for (sid, role, worker_id), literal in assign.items()
        if solver.boolean_value(literal)
    }
    objective = solver.objective_value
    return SolveResult(
        OPTIMAL if status == cp_model.OPTIMAL else FEASIBLE,
        _schedule_from(problem, starts, chosen),
        0.0 if status == cp_model.OPTIMAL else _gap(objective, solver.best_objective_bound),
        elapsed,
    )


def solve_milp(problem: SchedulingProblem, seconds: float) -> SolveResult:
    """Big-M disjunctive MILP. ``y[i,j]`` orders two subtasks that could land on the same person
    (and are not already ordered by their prerequisites); the order binds only when they actually
    share someone, which is what the ``2 − u_iw − u_jw`` term switches."""
    try:
        from ortools.math_opt.python import mathopt
    except ImportError as exc:  # pragma: no cover - exercised only without OR-Tools
        raise SolverUnavailable("OR-Tools (MathOpt/HiGHS) não está instalado no backend.") from exc
    began = time.monotonic()
    hint = list_schedule(problem)
    horizon = max(hint.makespan, 1)
    hint_start, hint_who = _hint_maps(hint)
    big_m = horizon
    model = mathopt.Model(name="ms-rcpsp")
    start = {
        sid: model.add_integer_variable(lb=0, ub=horizon - problem.duration[sid], name=f"s_{sid}")
        for sid in problem.subtasks
    }
    assign: dict[tuple[str, int, str], mathopt.Variable] = {}
    for sid in problem.subtasks:
        for pred in problem.preds[sid]:
            model.add_linear_constraint(start[sid] >= start[pred] + problem.duration[pred])
        for role in problem.roles[sid]:
            variables = []
            for worker in problem.candidates(role):
                variable = model.add_binary_variable(name=f"x_{sid}_{role}_{worker.id}")
                assign[(sid, role, worker.id)] = variable
                variables.append(variable)
            model.add_linear_constraint(sum(variables) == 1)
        if len(problem.roles[sid]) == 2:
            first, second = problem.roles[sid]
            for worker in problem.workers:
                pair = [assign.get((sid, first, worker.id)), assign.get((sid, second, worker.id))]
                if all(v is not None for v in pair):
                    model.add_linear_constraint(pair[0] + pair[1] <= 1)

    def uses(sid: str, worker_id: str) -> mathopt.LinearExpression:
        return sum(
            (
                assign[(sid, role, worker_id)]
                for role in problem.roles[sid]
                if (sid, role, worker_id) in assign
            ),
            start=mathopt.LinearExpression(),
        )

    before = _reachable(problem)
    workers_of = {sid: _workers_of(problem, sid) for sid in problem.subtasks}
    order: dict[tuple[str, str], mathopt.Variable] = {}
    busy = [sid for sid in problem.subtasks if problem.duration[sid] > 0]
    for index, first in enumerate(busy):
        for second in busy[index + 1 :]:
            if first in before[second] or second in before[first]:
                continue
            shared = workers_of[first] & workers_of[second]
            if not shared:
                continue
            y = model.add_binary_variable(name=f"y_{first}_{second}")
            order[(first, second)] = y
            for worker_id in sorted(shared):
                both = 2 - uses(first, worker_id) - uses(second, worker_id)
                model.add_linear_constraint(
                    start[second] >= start[first] + problem.duration[first] - big_m * (1 - y) - big_m * both
                )
                model.add_linear_constraint(
                    start[first] >= start[second] + problem.duration[second] - big_m * y - big_m * both
                )
    makespan = model.add_integer_variable(lb=min(lower_bound(problem), horizon), ub=horizon, name="makespan")
    for sid in problem.subtasks:
        model.add_linear_constraint(makespan >= start[sid] + problem.duration[sid])
    model.minimize(makespan)

    values: dict[mathopt.Variable, float] = {makespan: float(hint.makespan)}
    for sid in problem.subtasks:
        values[start[sid]] = float(hint_start[sid])
    for (sid, role, worker_id), variable in assign.items():
        values[variable] = 1.0 if hint_who.get((sid, role)) == worker_id else 0.0
    for (first, second), variable in order.items():
        values[variable] = 1.0 if hint_start[first] <= hint_start[second] else 0.0

    # HiGHS times itself by the wall clock. Where that clock jumps (a VM resyncing its time under
    # load), it believes the limit passed and stops early; the monotonic clock says how much time
    # really remains, so the solve resumes from its best answer until the limit is truly spent.
    deadline = began + float(seconds)
    while True:
        remaining = max(deadline - time.monotonic(), 0.5)
        result = mathopt.solve(
            model,
            mathopt.SolverType.HIGHS,
            params=mathopt.SolveParameters(time_limit=timedelta(seconds=remaining), random_seed=0),
            model_params=mathopt.ModelSolveParameters(
                solution_hints=[mathopt.SolutionHint(variable_values=values)]
            ),
        )
        stopped_by_clock = (
            result.termination.reason
            in (
                mathopt.TerminationReason.FEASIBLE,
                mathopt.TerminationReason.NO_SOLUTION_FOUND,
            )
            and result.termination.limit == mathopt.Limit.TIME
        )
        if not stopped_by_clock or time.monotonic() >= deadline - 0.5:
            break
        if result.has_primal_feasible_solution():
            values = dict(result.variable_values())
    elapsed = round(time.monotonic() - began, 3)
    if not result.has_primal_feasible_solution():
        return SolveResult(NO_SOLUTION, None, None, elapsed)
    solution = result.variable_values()
    starts = {sid: round(solution[start[sid]]) for sid in problem.subtasks}
    chosen = {
        (sid, role): worker_id
        for (sid, role, worker_id), variable in assign.items()
        if solution[variable] > 0.5
    }
    optimal = result.termination.reason == mathopt.TerminationReason.OPTIMAL
    objective = result.objective_value()
    return SolveResult(
        OPTIMAL if optimal else FEASIBLE,
        _schedule_from(problem, starts, chosen),
        0.0 if optimal else _gap(objective, result.best_objective_bound()),
        elapsed,
    )
