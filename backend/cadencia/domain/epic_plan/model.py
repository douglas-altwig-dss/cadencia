"""Entities of an epic plan and the parameters every number is computed with."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import asdict, dataclass, field, fields
from enum import StrEnum
from typing import Any

from cadencia.errors import Invalid

SENIORITIES = {"junior": "Júnior", "pleno": "Pleno", "senior": "Sênior"}
HOURS_SOURCES = {"original": "estimativa original", "estimate": "campo de estimativa"}


class Phase(StrEnum):
    PLANNING = "planejamento"
    EXECUTION = "execucao"


class Kind(StrEnum):
    EXECUTION = "execucao"
    CODE_REVIEW = "code_review"
    JIRA_SETUP = "cadastro_jira"


@dataclass(frozen=True)
class Role:
    id: int
    name: str
    description: str = ""
    color: str = "#868e96"
    order: int = 0
    #: Jira labels or components that mark a subtask as this role's work (case-insensitive).
    labels: tuple[str, ...] = ()


@dataclass(frozen=True)
class MemberRole:
    role_id: int
    seniority: str = "pleno"


@dataclass(frozen=True)
class Member:
    id: str
    name: str
    active: bool = True
    roles: tuple[MemberRole, ...] = ()

    @property
    def role_ids(self) -> frozenset[int]:
        return frozenset(r.role_id for r in self.roles)


@dataclass(frozen=True)
class Task:
    id: str
    title: str
    phase: Phase = Phase.EXECUTION
    has_code: bool = True
    business: str = ""
    technical: str = ""
    dependency_note: str = ""
    status: str = ""
    done: bool = False


@dataclass(frozen=True)
class Subtask:
    id: str
    task_id: str
    title: str
    hours: float
    #: One role, or two for a composite "A + B" subtask that needs both people at once.
    roles: tuple[int, ...]
    kind: Kind = Kind.EXECUTION
    prerequisites: tuple[str, ...] = ()
    status: str = ""
    done: bool = False
    #: Where the roles came from: "manual" | "rotulo" | "responsavel" | "tarefa" | "" (none found).
    role_source: str = ""
    assignee: str = ""

    @property
    def composite(self) -> bool:
        return len(self.roles) == 2


@dataclass(frozen=True)
class Problem:
    """Something wrong with the data. ``erro`` stops the schedules; ``aviso`` only informs."""

    level: str  # "erro" | "aviso"
    code: str
    message: str
    subtasks: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "nivel": self.level,
            "codigo": self.code,
            "mensagem": self.message,
            "subtarefas": list(self.subtasks),
        }


@dataclass(frozen=True)
class Epic:
    key: str
    title: str
    tasks: tuple[Task, ...]
    subtasks: tuple[Subtask, ...]
    problems: tuple[Problem, ...] = ()
    #: How many subtasks carry a value in each hours source, so the page can suggest the other one.
    hours_found: Mapping[str, int] = field(default_factory=dict)

    @property
    def task_by_id(self) -> dict[str, Task]:
        return {t.id: t for t in self.tasks}

    @property
    def subtask_by_id(self) -> dict[str, Subtask]:
        return {s.id: s for s in self.subtasks}

    def subtasks_of(self, task_id: str) -> list[Subtask]:
        return [s for s in self.subtasks if s.task_id == task_id]

    def phase_of(self, subtask: Subtask) -> Phase:
        task = self.task_by_id.get(subtask.task_id)
        return task.phase if task else Phase.EXECUTION

    @property
    def errors(self) -> list[Problem]:
        return [p for p in self.problems if p.level == "erro"]


# Parameter name → (default, minimum, maximum). Hours are hours; "min" fields are minutes.
_NUMERIC: dict[str, tuple[float, float, float]] = {
    "workday_hours": (6.0, 0.5, 24.0),
    "jira_overhead_hours": (1.0, 0.0, 40.0),
    "code_review_hours": (0.5, 0.0, 40.0),
    "card_minutes": (10.0, 0.0, 240.0),
    "slot_hours": (0.5, 0.25, 8.0),
    "solver_seconds": (60.0, 1.0, 600.0),
}


@dataclass(frozen=True)
class Parameters:
    """Plan parameters (section 4), editable in the UI. Label names map Jira data onto the model."""

    workday_hours: float = 6.0
    jira_overhead_hours: float = 1.0
    code_review_hours: float = 0.5
    card_minutes: float = 10.0
    slot_hours: float = 0.5
    solver_seconds: float = 60.0
    label_code_review: str = "code-review"
    label_jira_setup: str = "cadastro-jira"
    label_planning: str = "planejamento"
    label_no_code: str = "sem-codigo"
    #: Where a subtask's hours come from: Jira's original estimate, or the estimate field (the one
    #: story points live in), which some teams fill with hours on subtasks.
    hours_source: str = "original"
    extra: Mapping[str, Any] = field(default_factory=dict, compare=False, repr=False)

    @property
    def week_hours(self) -> float:
        return self.workday_hours * 5

    @property
    def slots_per_day(self) -> int:
        return round(self.workday_hours / self.slot_hours)

    def validated(self) -> Parameters:
        for name, (_default, low, high) in _NUMERIC.items():
            value = getattr(self, name)
            if not low <= value <= high:
                raise Invalid(f"Parâmetro {name} deve ficar entre {low:g} e {high:g}.")
        if abs(self.workday_hours / self.slot_hours - self.slots_per_day) > 1e-9:
            raise Invalid("A jornada útil precisa ser múltipla da granularidade de agenda.")
        if self.hours_source not in HOURS_SOURCES:
            raise Invalid(f"Fonte das horas inválida: {self.hours_source}.")
        for name in ("label_code_review", "label_jira_setup", "label_planning", "label_no_code"):
            if not str(getattr(self, name)).strip():
                raise Invalid(f"Parâmetro {name} não pode ficar vazio.")
        return self

    def as_dict(self) -> dict[str, Any]:
        out = asdict(self)
        out.pop("extra", None)
        return out

    @classmethod
    def from_dict(cls, data: Mapping[str, Any] | None) -> Parameters:
        data = data or {}
        known = {f.name for f in fields(cls)} - {"extra"}
        values: dict[str, Any] = {}
        for name in known:
            if name not in data or data[name] is None:
                continue
            values[name] = float(data[name]) if name in _NUMERIC else str(data[name]).strip()
        return cls(**values)

    def merged(self, overrides: Mapping[str, Any] | None) -> Parameters:
        return Parameters.from_dict({**self.as_dict(), **(overrides or {})})
