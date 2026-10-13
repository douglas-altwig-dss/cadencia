"""Builders for domain objects used across the tests."""

from __future__ import annotations

from datetime import UTC, date, datetime

from cadencia.domain.history import IssueHistory
from cadencia.domain.models import (
    BoardProfile,
    ChangeField,
    Column,
    Issue,
    Person,
    Sprint,
    Status,
    StatusCategory,
    Transition,
)

TODO = Status("1", "A fazer", StatusCategory.TODO)
DOING = Status("3", "Em andamento", StatusCategory.IN_PROGRESS)
REVIEW = Status("4", "Code Review", StatusCategory.IN_PROGRESS)
BLOCKED = Status("5", "Bloqueado", StatusCategory.IN_PROGRESS)
DONE = Status("10", "Concluído", StatusCategory.DONE)
STATUSES = {s.id: s for s in (TODO, DOING, REVIEW, BLOCKED, DONE)}
COLUMNS = (
    Column("A fazer", ("1",)),
    Column("Em andamento", ("3", "5")),
    Column("Code Review", ("4",)),
    Column("Concluído", ("10",)),
)
PROFILE = BoardProfile(board_id=1, columns=COLUMNS, timezone="America/Sao_Paulo")

ANA = Person("acc-ana", "Ana")
BRUNO = Person("acc-bruno", "Bruno")
CARLA = Person("acc-carla", "Carla")

# Sprint 12: Monday 2026-08-31 09:00 → Friday 2026-09-11 18:00 (São Paulo, UTC-3).
SPRINT_START = datetime(2026, 8, 31, 12, 0, tzinfo=UTC)
SPRINT_END = datetime(2026, 9, 11, 21, 0, tzinfo=UTC)
CHECKPOINT_1 = datetime(2026, 9, 4, 21, 0, tzinfo=UTC)
SPRINT_12 = Sprint(12, 1, "Sprint 12", "active", SPRINT_START, SPRINT_END)
SPRINT_11 = Sprint(
    11,
    1,
    "Sprint 11",
    "closed",
    datetime(2026, 8, 17, 12, 0, tzinfo=UTC),
    datetime(2026, 8, 28, 21, 0, tzinfo=UTC),
    datetime(2026, 8, 28, 21, 5, tzinfo=UTC),
)


def at(text: str) -> datetime:
    value = datetime.fromisoformat(text)
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def issue(
    key: str,
    *,
    status: Status = TODO,
    created: str = "2026-08-25T12:00:00",
    type_name: str = "Story",
    level: int = 0,
    assignee: Person | None = None,
    parent: str | None = None,
    estimate: float | None = None,
    sprints: tuple[int, ...] = (),
    due: date | None = None,
    flagged: bool = False,
    blocked_by: tuple[str, ...] = (),
    components: tuple[str, ...] = (),
    labels: tuple[str, ...] = (),
    rank: str | None = None,
    summary: str | None = None,
) -> Issue:
    created_at = at(created)
    return Issue(
        key=key,
        summary=summary or f"Item {key}",
        type_name=type_name,
        hierarchy_level=level,
        status=status,
        created=created_at,
        updated=created_at,
        assignee=assignee,
        parent_key=parent,
        estimate=estimate,
        sprint_ids=sprints,
        due_date=due,
        flagged=flagged,
        blocked_by=blocked_by,
        components=components,
        labels=labels,
        rank=rank,
    )


_counter = iter(range(1, 10**6))


def move(key: str, when: str, frm: Status, to: Status, author: str = "Ana") -> Transition:
    return Transition(
        issue_key=key,
        at=at(when),
        field=ChangeField.STATUS,
        from_id=frm.id,
        from_value=frm.name,
        to_id=to.id,
        to_value=to.name,
        author_name=author,
        history_id=str(next(_counter)),
    )


def reassign(key: str, when: str, frm: Person | None, to: Person | None) -> Transition:
    return Transition(
        issue_key=key,
        at=at(when),
        field=ChangeField.ASSIGNEE,
        from_id=frm.account_id if frm else None,
        from_value=frm.display_name if frm else None,
        to_id=to.account_id if to else None,
        to_value=to.display_name if to else None,
        author_name="Ana",
        history_id=str(next(_counter)),
    )


def sprint_change(key: str, when: str, frm: str | None, to: str | None) -> Transition:
    return Transition(
        issue_key=key,
        at=at(when),
        field=ChangeField.SPRINT,
        from_id=frm,
        from_value=frm,
        to_id=to,
        to_value=to,
        history_id=str(next(_counter)),
    )


def flag(key: str, when: str, on: bool = True) -> Transition:
    return Transition(
        issue_key=key,
        at=at(when),
        field=ChangeField.FLAGGED,
        from_id=None,
        from_value="" if on else "Impediment",
        to_id=None,
        to_value="Impediment" if on else "",
        history_id=str(next(_counter)),
    )


def history(item: Issue, *transitions: Transition) -> IssueHistory:
    return IssueHistory(item, transitions, STATUSES)
