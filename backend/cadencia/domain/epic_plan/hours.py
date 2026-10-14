"""Section 5's canonical numbers: hours, person-hours per role, capacity and the display formats.

Every view reads these; none recomputes them. Two sums look alike and are not:

- **hours** count each subtask once, composite or not — what the epic costs;
- **person-hours** give each role of a composite "A + B" subtask the full hour, because both
  people work at the same time — what each area spends.

The reconciliation ties them: Σ person-hours − Σ composite hours = planning + execution hours.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from cadencia.domain.epic_plan.model import Epic, Kind, Member, Parameters, Phase, Problem, Role
from cadencia.i18n.message import Msg

EPSILON = 1e-6


def _sum(values: Iterable[float]) -> float:
    return round(sum(values), 4)


def planning_hours(epic: Epic) -> float:
    return _sum(s.hours for s in epic.subtasks if epic.phase_of(s) is Phase.PLANNING)


def execution_hours(epic: Epic) -> float:
    """Includes code review: a code-review subtask is execution work like any other."""
    return _sum(s.hours for s in epic.subtasks if epic.phase_of(s) is Phase.EXECUTION)


def code_review_overhead(epic: Epic) -> float:
    """The code-review subset of ``execution_hours`` (not added on top of it)."""
    return _sum(s.hours for s in epic.subtasks if s.kind is Kind.CODE_REVIEW)


def jira_overhead_count(epic: Epic) -> int:
    """Subtasks that pay the Jira overhead: execution kind, in a task that has code."""
    tasks = epic.task_by_id
    return sum(
        1
        for s in epic.subtasks
        if s.kind is Kind.EXECUTION and (task := tasks.get(s.task_id)) is not None and task.has_code
    )


def jira_overhead(epic: Epic, params: Parameters) -> float:
    """A cost of the epic as a whole: in the header and the total, never on a role or a calendar."""
    return round(params.jira_overhead_hours * jira_overhead_count(epic), 4)


def epic_total(epic: Epic, params: Parameters) -> float:
    return round(planning_hours(epic) + execution_hours(epic) + jira_overhead(epic, params), 4)


def person_hours(epic: Epic, roles: Sequence[Role]) -> dict[int, float]:
    """Hours per role, in ``roles`` order; a composite subtask gives each of its roles the full hour."""
    out = {r.id: 0.0 for r in roles}
    for subtask in epic.subtasks:
        for role_id in subtask.roles:
            if role_id in out:
                out[role_id] += subtask.hours
    return {k: round(v, 4) for k, v in out.items()}


def person_hours_share(hours: dict[int, float]) -> dict[int, float | None]:
    """Each role's fraction of all person-hours (not of the epic's hours: composites count twice)."""
    total = sum(hours.values())
    return {k: (round(v / total, 4) if total else None) for k, v in hours.items()}


def composite_hours(epic: Epic) -> float:
    return _sum(s.hours for s in epic.subtasks if s.composite)


@dataclass(frozen=True)
class Reconciliation:
    person_hours: float
    composite_hours: float
    planning_hours: float
    execution_hours: float

    @property
    def closes(self) -> bool:
        left = self.person_hours - self.composite_hours
        return abs(left - (self.planning_hours + self.execution_hours)) < EPSILON

    def as_dict(self) -> dict[str, object]:
        return {
            "horas_pessoa": self.person_hours,
            "horas_compostas": self.composite_hours,
            "horas_planejamento": self.planning_hours,
            "horas_execucao": self.execution_hours,
            "fecha": self.closes,
        }


def reconciliation(epic: Epic, roles: Sequence[Role]) -> Reconciliation:
    return Reconciliation(
        person_hours=_sum(person_hours(epic, roles).values()),
        composite_hours=composite_hours(epic),
        planning_hours=planning_hours(epic),
        execution_hours=execution_hours(epic),
    )


def real_capacity(members: Sequence[Member], params: Parameters) -> float:
    """h/week of the selected people, each counted once however many roles they cover."""
    return round(len({m.id for m in members}) * params.week_hours, 4)


def potential_capacity(role_id: int, members: Sequence[Member], params: Parameters) -> float:
    """The most this role could get if its people gave it all their time. Summed over roles it can
    exceed ``real_capacity``; the schedulers always work per person, never from this number."""
    return round(sum(1 for m in members if role_id in m.role_ids) * params.week_hours, 4)


def round_up(hours: float, step: float) -> float:
    return round(math.ceil(hours / step - EPSILON) * step, 4)


def consistency_problems(epic: Epic, params: Parameters) -> list[Problem]:
    """Code-review and card-creation hours checked against what the parameters say they cost."""
    problems: list[Problem] = []
    missing_review: list[tuple[str, float]] = []
    for task in epic.tasks:
        subtasks = epic.subtasks_of(task.id)
        reviews = [s for s in subtasks if s.kind is Kind.CODE_REVIEW]
        if not task.has_code:
            if reviews:
                problems.append(
                    Problem(
                        "aviso",
                        "code_review_sem_codigo",
                        Msg("epic_plan.problem.code_review_without_code", task=task.id),
                        tuple(s.id for s in reviews),
                    )
                )
            continue
        executions = [s for s in subtasks if s.kind is Kind.EXECUTION]
        if not executions:
            continue
        expected = round_up(params.code_review_hours * len(executions), params.slot_hours)
        actual = _sum(s.hours for s in reviews)
        if not reviews:
            missing_review.append((task.id, expected))
        elif abs(actual - expected) > EPSILON:
            problems.append(
                Problem(
                    "aviso",
                    "code_review_divergente",
                    Msg(
                        "epic_plan.problem.code_review_mismatch",
                        task=task.id,
                        actual=actual,
                        expected=expected,
                        count=len(executions),
                        each=params.code_review_hours,
                    ),
                    tuple(s.id for s in reviews),
                )
            )
    setups = [s for s in epic.subtasks if s.kind is Kind.JIRA_SETUP and epic.phase_of(s) is Phase.PLANNING]
    cards = len(epic.tasks) + len(epic.subtasks)
    expected = round_up(params.card_minutes * cards / 60, params.slot_hours)
    actual = _sum(s.hours for s in setups)
    if setups and abs(actual - expected) > EPSILON:
        problems.append(
            Problem(
                "aviso",
                "cadastro_divergente",
                Msg(
                    "epic_plan.problem.card_setup_mismatch",
                    actual=actual,
                    expected=expected,
                    cards=cards,
                    minutes=params.card_minutes,
                ),
                tuple(s.id for s in setups),
            )
        )
    return problems


def hours_label(hours: float, workday_hours: float) -> Msg:
    """``19h · 3d 1h`` (pt-BR, en-US) / ``19h · 3T 1h`` (de-DE): the hours, then whole workdays
    plus what is left of the last one. ``rest`` is 0 when nothing is left; the catalogue formats
    the numbers per locale (``cadencia.i18n.fmt.hours``: ``7,5`` in pt-BR, as it always was)."""
    days = int(hours // workday_hours + EPSILON)
    rest = round(hours - days * workday_hours, 4)
    return Msg("epic_plan.hours_label", hours=hours, days=days, rest=rest if days and rest > EPSILON else 0)
