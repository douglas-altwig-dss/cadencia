"""Domain model. Pure data: no I/O, no framework imports."""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass, field, fields, replace
from datetime import date, datetime
from enum import IntEnum, StrEnum
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from cadencia.errors import Invalid


class StatusCategory(StrEnum):
    """Jira ``statusCategory.key``. Everything "done"-related uses this, never the status name."""

    TODO = "new"
    IN_PROGRESS = "indeterminate"
    DONE = "done"

    @property
    def rank(self) -> int:
        return _CATEGORY_RANK[self]


_CATEGORY_RANK = {StatusCategory.TODO: 0, StatusCategory.IN_PROGRESS: 1, StatusCategory.DONE: 2}


class HierarchyLevel(IntEnum):
    """Jira ``issuetype.hierarchyLevel``; classification never depends on the type name."""

    SUBTASK = -1
    STANDARD = 0
    EPIC = 1
    INITIATIVE = 2


@dataclass(frozen=True, slots=True)
class Person:
    account_id: str
    display_name: str


@dataclass(frozen=True, slots=True)
class Status:
    id: str
    name: str
    category: StatusCategory


@dataclass(frozen=True, slots=True)
class Column:
    name: str
    status_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Space:
    """A Jira space: the team the boards belong to, one level above :class:`Board`.

    A space maps to the Jira project a board is located in. Several boards of the same team live
    in the same space, which is why "team" only ever means a space — never a board.
    """

    key: str
    name: str

    @property
    def label(self) -> str:
        return self.name or self.key


@dataclass(frozen=True, slots=True)
class Board:
    id: int
    name: str
    type: str  # "scrum" | "kanban" | "simple"
    space_key: str | None = None
    space_name: str | None = None

    @property
    def space(self) -> Space | None:
        if not self.space_key:
            return None
        return Space(self.space_key, self.space_name or self.space_key)


@dataclass(frozen=True, slots=True)
class Sprint:
    id: int
    board_id: int
    name: str
    state: str  # "active" | "future" | "closed"
    start: datetime | None = None
    end: datetime | None = None
    complete: datetime | None = None
    goal: str | None = None


@dataclass(frozen=True, slots=True)
class Issue:
    key: str
    summary: str
    type_name: str
    hierarchy_level: int
    status: Status
    created: datetime
    updated: datetime
    project_key: str = ""
    id: str = ""
    assignee: Person | None = None
    resolution_date: datetime | None = None
    due_date: date | None = None
    parent_key: str | None = None
    estimate: float | None = None
    sprint_ids: tuple[int, ...] = ()
    flagged: bool = False
    labels: tuple[str, ...] = ()
    components: tuple[str, ...] = ()
    priority: str | None = None
    rank: str | None = None
    blocked_by: tuple[str, ...] = ()
    #: Jira's "Original estimate", in hours. Story points stay in ``estimate``: the epic plan needs
    #: hours a person can put on a calendar, and points are not that.
    original_estimate_hours: float | None = None
    #: The description as plain text, headings kept as ``#`` lines (see ``mapping.adf_text``).
    description: str = ""

    @property
    def is_done(self) -> bool:
        return self.status.category is StatusCategory.DONE

    @property
    def is_subtask(self) -> bool:
        return self.hierarchy_level <= HierarchyLevel.SUBTASK

    @property
    def is_epic_or_above(self) -> bool:
        return self.hierarchy_level >= HierarchyLevel.EPIC


class ChangeField(StrEnum):
    STATUS = "status"
    ASSIGNEE = "assignee"
    SPRINT = "sprint"
    ESTIMATE = "estimate"
    FLAGGED = "flagged"
    PARENT = "parent"


@dataclass(frozen=True, slots=True)
class Transition:
    """One changelog item we care about, normalised from the Jira payload."""

    issue_key: str
    at: datetime
    field: ChangeField
    from_id: str | None
    from_value: str | None
    to_id: str | None
    to_value: str | None
    author_id: str | None = None
    author_name: str | None = None
    history_id: str = ""
    item_index: int = 0


@dataclass(frozen=True)
class BoardProfile:
    """Per-board configuration (RF-05). Defaults mirror the global settings."""

    board_id: int
    columns: tuple[Column, ...] = ()
    wip_columns: tuple[str, ...] | None = None  # None: statuses in the "in progress" category
    active_columns: tuple[str, ...] | None = None  # None: same as WIP (flow efficiency)
    blocked_status_names: tuple[str, ...] = ("Blocked", "Bloqueado", "Impedido")
    timezone: str = "America/Sao_Paulo"
    checkpoint_weekday: int = 4
    checkpoint_hour: int = 18
    default_sprint_weeks: int = 2
    stagnation_checkpoints: int = 1
    aging_percentile: float = 85.0
    hours_per_day: float = 8.0
    focus_factor: float = 0.7
    hours_per_point: float = 4.0
    unestimated_item_hours: float = 8.0
    max_items_per_person: int = 8
    overload_threshold: float = 0.10
    idle_threshold: float = -0.20
    members: tuple[str, ...] = ()  # account ids; empty: whoever is assigned in the sprint
    affinity: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    holidays: tuple[date, ...] = ()

    # Keys users may edit through the API (columns come from Jira, not from the user).
    EDITABLE = (
        "wip_columns",
        "active_columns",
        "blocked_status_names",
        "timezone",
        "checkpoint_weekday",
        "checkpoint_hour",
        "default_sprint_weeks",
        "stagnation_checkpoints",
        "aging_percentile",
        "hours_per_day",
        "focus_factor",
        "hours_per_point",
        "unestimated_item_hours",
        "max_items_per_person",
        "overload_threshold",
        "idle_threshold",
        "members",
        "affinity",
        "holidays",
    )

    #: Numeric settings as (integer only, lowest, highest). A little wider than the settings screen
    #: offers: the point is to refuse what would break a view, not what the UI happens not to show.
    LIMITS = {
        "checkpoint_weekday": (True, 0, 6),
        "checkpoint_hour": (True, 0, 23),
        "default_sprint_weeks": (True, 1, 8),
        "stagnation_checkpoints": (True, 1, 52),
        "aging_percentile": (False, 1, 100),
        "hours_per_day": (False, 0.5, 24),
        "focus_factor": (False, 0.01, 1),
        "hours_per_point": (False, 0.01, 1000),
        "unestimated_item_hours": (False, 0, 1000),
        "max_items_per_person": (True, 1, 1000),
        "overload_threshold": (False, 0, 10),
        "idle_threshold": (False, -1, 0),
    }
    _NAME_LISTS = ("wip_columns", "active_columns", "blocked_status_names", "members")

    @classmethod
    def check(cls, changes: Mapping[str, Any]) -> None:
        """Refuse settings that would break the views reading them (RF-05).

        `from_parts` only coerces, so it let these through: a time zone that does not exist made
        every view of the board fail, and a weekday of 9 broke the checkpoint scheduler. ``None``
        is always accepted, because it means "back to the default".
        """
        problems = [
            f"{key}: {problem}"
            for key, value in changes.items()
            if value is not None and (problem := cls._problem(key, value))
        ]
        if problems:
            raise Invalid("; ".join(problems))

    @classmethod
    def _problem(cls, key: str, value: Any) -> str | None:
        if key in cls.LIMITS:
            integer, lowest, highest = cls.LIMITS[key]
            is_number = isinstance(value, int | float) and not isinstance(value, bool)
            if not is_number or not math.isfinite(value) or (integer and value != int(value)):
                return "precisa ser um número inteiro" if integer else "precisa ser um número"
            return None if lowest <= value <= highest else f"precisa estar entre {lowest} e {highest}"
        if key == "timezone":
            try:
                ZoneInfo(str(value))
            except (ZoneInfoNotFoundError, ValueError):
                return f"fuso horário desconhecido: {value!r}"
            return None
        if key in cls._NAME_LISTS:
            ok = isinstance(value, list | tuple) and all(isinstance(v, str) for v in value)
            return None if ok else "precisa ser uma lista de textos"
        if key == "holidays":
            if not isinstance(value, list | tuple):
                return "precisa ser uma lista de datas AAAA-MM-DD"
            for day in value:
                if isinstance(day, date):
                    continue
                try:
                    date.fromisoformat(str(day))
                except ValueError:
                    return f"data inválida: {day!r} (use AAAA-MM-DD)"
            return None
        if key == "affinity":
            ok = isinstance(value, Mapping) and all(
                isinstance(v, list | tuple) and all(isinstance(x, str) for x in v) for v in value.values()
            )
            return None if ok else "precisa mapear cada pessoa a uma lista de textos"
        return None

    # ---- workflow helpers

    def column_of(self, status_id: str) -> str | None:
        for column in self.columns:
            if status_id in column.status_ids:
                return column.name
        return None

    def column_index(self, status_id: str) -> int | None:
        for index, column in enumerate(self.columns):
            if status_id in column.status_ids:
                return index
        return None

    def is_wip(self, status: Status) -> bool:
        if self.wip_columns is not None:
            column = self.column_of(status.id)
            if column is not None:
                return column in self.wip_columns
        return status.category is StatusCategory.IN_PROGRESS

    def is_active(self, status: Status) -> bool:
        if self.active_columns is not None:
            column = self.column_of(status.id)
            if column is not None:
                return column in self.active_columns
        return self.is_wip(status)

    def is_blocked_status(self, status: Status) -> bool:
        names = {n.casefold() for n in self.blocked_status_names}
        return status.name.casefold() in names

    def order_of(self, status: Status) -> float:
        """Position used to detect backward moves: board column, else category rank."""
        index = self.column_index(status.id)
        if index is not None:
            return float(index)
        return status.category.rank * 100.0

    # ---- (de)serialisation for the store

    def settings_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for name in self.EDITABLE:
            value = getattr(self, name)
            if isinstance(value, tuple):
                value = [v.isoformat() if isinstance(v, date) else v for v in value]
            elif isinstance(value, Mapping):
                value = {k: list(v) for k, v in value.items()}
            out[name] = value
        return out

    @classmethod
    def from_parts(
        cls,
        board_id: int,
        columns: list[dict[str, Any]] | None,
        settings: Mapping[str, Any] | None,
        defaults: Mapping[str, Any] | None = None,
    ) -> BoardProfile:
        values: dict[str, Any] = {}
        known = {f.name for f in fields(cls)}
        for source in (defaults or {}, settings or {}):
            for key, value in source.items():
                if key in known and key in cls.EDITABLE and value is not None:
                    values[key] = value
        normalised: dict[str, Any] = {}
        for key, value in values.items():
            if key == "affinity":
                normalised[key] = {str(k): tuple(v) for k, v in dict(value).items()}
            elif key == "holidays":
                normalised[key] = tuple(
                    v if isinstance(v, date) else date.fromisoformat(str(v)) for v in value
                )
            elif key in {"wip_columns", "active_columns", "blocked_status_names", "members"}:
                normalised[key] = tuple(value)
            else:
                normalised[key] = value
        cols = tuple(
            Column(name=c["name"], status_ids=tuple(str(s) for s in c.get("status_ids", ())))
            for c in (columns or [])
        )
        return cls(board_id=board_id, columns=cols, **normalised)

    def with_settings(self, **changes: Any) -> BoardProfile:
        return replace(self, **changes)
