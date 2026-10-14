"""Repositories: the only module that writes SQL.

Every write is an idempotent upsert keyed by natural keys (issue key, changelog history id,
checkpoint instant…), so an interrupted collection is repaired by simply running it again.
"""

from __future__ import annotations

import contextvars
import re
from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Any, NamedTuple

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from cadencia.domain.capacity import Absence, Availability
from cadencia.domain.epic_plan.seed import ROLE_SEED
from cadencia.domain.models import (
    Board,
    BoardProfile,
    ChangeField,
    Issue,
    Person,
    Space,
    Sprint,
    Status,
    StatusCategory,
    Transition,
)
from cadencia.errors import Invalid, NotFound
from cadencia.i18n import STORAGE_LOCALE, Msg, current_locale, render
from cadencia.jira.fields import FieldMap
from cadencia.store import schema as s

_CHUNK = 200
FIELD_MAP_KEY = "jira.field_map"
FIELD_OVERRIDES_KEY = "jira.field_overrides"


def utcnow() -> datetime:
    return datetime.now(UTC)


def _insert_for(session: Session) -> Any:
    dialect = session.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:  # pragma: no cover - guarded by configuration
        raise RuntimeError(f"banco não suportado: {dialect}")  # i18n: out of scope
    return insert


def upsert(
    session: Session,
    model: type[s.Base],
    rows: Iterable[Mapping[str, Any]],
    keys: Sequence[str],
    *,
    update: Sequence[str] | None = None,
    do_nothing: bool = False,
) -> None:
    batch = [dict(r) for r in rows]
    if not batch:
        return
    insert = _insert_for(session)
    table = model.__table__
    for i in range(0, len(batch), _CHUNK):
        chunk = batch[i : i + _CHUNK]
        stmt = insert(table).values(chunk)
        columns = list(update) if update is not None else [c for c in chunk[0] if c not in keys]
        if do_nothing or not columns:
            stmt = stmt.on_conflict_do_nothing(index_elements=list(keys))
        else:
            stmt = stmt.on_conflict_do_update(
                index_elements=list(keys), set_={c: stmt.excluded[c] for c in columns}
            )
        session.execute(stmt)


def _chunks(values: Sequence[Any], size: int = 500) -> Iterable[Sequence[Any]]:
    for i in range(0, len(values), size):
        yield values[i : i + size]


# ---------------------------------------------------------------- settings


def get_setting(session: Session, key: str, default: Any = None) -> Any:
    row = session.get(s.SettingRow, key)
    return default if row is None or row.value is None else row.value


def set_setting(session: Session, key: str, value: Any) -> None:
    upsert(session, s.SettingRow, [{"key": key, "value": value}], ["key"])


def delete_setting(session: Session, key: str) -> None:
    session.execute(delete(s.SettingRow).where(s.SettingRow.key == key))


def discovered_field_map(session: Session) -> FieldMap:
    return FieldMap.from_dict(get_setting(session, FIELD_MAP_KEY))


def field_overrides(session: Session) -> dict[str, Any]:
    return dict(get_setting(session, FIELD_OVERRIDES_KEY, {}))


def load_field_map(session: Session) -> FieldMap:
    return discovered_field_map(session).merged(field_overrides(session))


def save_field_map(session: Session, field_map: FieldMap) -> None:
    set_setting(session, FIELD_MAP_KEY, field_map.as_dict())


def save_field_overrides(session: Session, overrides: Mapping[str, Any]) -> None:
    allowed = set(FieldMap().as_dict())
    set_setting(session, FIELD_OVERRIDES_KEY, {k: v for k, v in overrides.items() if k in allowed})


# ---------------------------------------------------------------- boards


def upsert_spaces(session: Session, spaces: Iterable[Space], at: datetime) -> None:
    rows = [{"key": sp.key, "name": sp.name, "discovered_at": at} for sp in spaces]
    upsert(session, s.SpaceRow, rows, ["key"], update=["name", "discovered_at"])


def space_from_row(row: s.SpaceRow) -> Space:
    return Space(row.key, row.name)


def list_spaces(session: Session) -> list[s.SpaceRow]:
    return list(session.scalars(select(s.SpaceRow).order_by(s.SpaceRow.name, s.SpaceRow.key)))


def spaces_of_boards(session: Session, rows: Iterable[s.BoardRow]) -> dict[str, Space]:
    """The spaces the given boards live in, by key — named from the space table when known."""
    keys = {r.space_key for r in rows if r.space_key}
    known = {
        r.key: Space(r.key, r.name)
        for r in session.scalars(select(s.SpaceRow).where(s.SpaceRow.key.in_(keys)))
    }
    for row in rows:
        if row.space_key and row.space_key not in known:
            known[row.space_key] = Space(row.space_key, row.space_name or row.space_key)
    return known


def upsert_boards(session: Session, boards: Iterable[Board], at: datetime) -> None:
    rows = [
        {
            "id": b.id,
            "name": b.name,
            "type": b.type,
            "space_key": b.space_key,
            "space_name": b.space_name,
            "selected": False,
            "columns": [],
            "settings": {},
            "discovered_at": at,
        }
        for b in boards
    ]
    upsert(
        session,
        s.BoardRow,
        rows,
        ["id"],
        update=["name", "type", "space_key", "space_name", "discovered_at"],
    )


def board_from_row(row: s.BoardRow) -> Board:
    return Board(row.id, row.name, row.type, row.space_key, row.space_name)


def list_boards(
    session: Session,
    *,
    query: str | None = None,
    selected: bool | None = None,
    offset: int = 0,
    limit: int = 50,
) -> tuple[list[s.BoardRow], int]:
    stmt = select(s.BoardRow)
    if query:
        like = f"%{query.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(s.BoardRow.name).like(like),
                func.lower(func.coalesce(s.BoardRow.space_key, "")).like(like),
                func.lower(func.coalesce(s.BoardRow.space_name, "")).like(like),
            )
        )
    if selected is not None:
        stmt = stmt.where(s.BoardRow.selected.is_(selected))
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    order = (
        func.lower(func.coalesce(s.BoardRow.space_name, s.BoardRow.space_key, "\uffff")),
        s.BoardRow.name,
        s.BoardRow.id,
    )
    rows = session.scalars(stmt.order_by(*order).offset(offset).limit(limit))
    return list(rows), int(total)


def selected_boards(session: Session) -> list[s.BoardRow]:
    return list(
        session.scalars(select(s.BoardRow).where(s.BoardRow.selected.is_(True)).order_by(s.BoardRow.name))
    )


def people_by_space(session: Session, *, selected_only: bool = True) -> dict[str | None, list[Person]]:
    """Who worked in each space, from the assignees of the issues on the space's boards (RF-23).

    A person who is assigned work in two spaces appears under both: the duplication is the point,
    it is how a shared person shows up as shared.
    """
    stmt = (
        select(s.BoardRow.space_key, s.IssueRow.assignee_id, s.IssueRow.assignee_name)
        .select_from(s.BoardRow)
        .join(s.IssueBoardRow, s.IssueBoardRow.board_id == s.BoardRow.id)
        .join(s.IssueRow, s.IssueRow.key == s.IssueBoardRow.issue_key)
        .where(s.IssueRow.assignee_id.is_not(None))
        .distinct()
    )
    if selected_only:
        stmt = stmt.where(s.BoardRow.selected.is_(True))
    names = people_names(session)
    out: dict[str | None, dict[str, Person]] = {}
    for space_key, account_id, assignee_name in session.execute(stmt):
        person = Person(account_id, names.get(account_id) or assignee_name or account_id)
        out.setdefault(space_key or None, {})[account_id] = person
    return {
        key: sorted(people.values(), key=lambda p: p.display_name.casefold()) for key, people in out.items()
    }


def set_selected_boards(session: Session, board_ids: Iterable[int]) -> None:
    wanted = set(board_ids)
    for row in session.scalars(select(s.BoardRow)):
        row.selected = row.id in wanted


def save_board_columns(session: Session, board_id: int, columns: list[dict[str, Any]]) -> None:
    row = session.get(s.BoardRow, board_id)
    if row is not None:
        row.columns = columns


def profile_defaults(settings: Any) -> dict[str, Any]:
    return {
        "timezone": settings.timezone,
        "checkpoint_weekday": settings.checkpoint_weekday,
        "checkpoint_hour": settings.checkpoint_hour,
        "default_sprint_weeks": settings.default_sprint_weeks,
    }


def board_profile(session: Session, board_id: int, defaults: Mapping[str, Any] | None = None) -> BoardProfile:
    row = session.get(s.BoardRow, board_id)
    return BoardProfile.from_parts(
        board_id, row.columns if row else [], row.settings if row else {}, defaults
    )


def update_board_settings(
    session: Session, board_id: int, changes: Mapping[str, Any], defaults: Mapping[str, Any] | None = None
) -> BoardProfile:
    row = session.get(s.BoardRow, board_id)
    if row is None:
        raise NotFound(board_id, Msg("store.board.not_found", board=board_id))
    unknown = set(changes) - set(BoardProfile.EDITABLE)
    if unknown:
        raise Invalid(Msg("store.board.unknown_settings", fields=", ".join(sorted(unknown))))
    BoardProfile.check(changes)
    merged = {**(row.settings or {}), **changes}
    profile = BoardProfile.from_parts(board_id, row.columns, merged, defaults)
    row.settings = {k: v for k, v in profile.settings_dict().items() if k in merged}
    return profile


# ---------------------------------------------------------------- people, statuses, sprints


# ---------------------------------------------------------------- variables (RF-45, RF-52)

VARIABLE_SCOPES = ("global", "space", "board", "slide")
#: Narrowest first: this is the order a value is looked for, and the order the UI explains.
_RESOLUTION = ("slide", "board", "space", "global")
_NAME = re.compile(r"^[a-z0-9]+(?:[_-][a-z0-9]+)*$")


def valid_variable_name(name: str) -> bool:
    """Names live inside ``{{texto.<name>}}``, so they stay slug-shaped."""
    return bool(_NAME.match(name)) and len(name) <= 64


def list_variables(session: Session, template_id: int | None = None) -> list[s.VariableRow]:
    """Definitions a template may use: its own, plus the ones bound to no template at all."""
    stmt = select(s.VariableRow)
    if template_id is not None:
        stmt = stmt.where(or_(s.VariableRow.template_id.is_(None), s.VariableRow.template_id == template_id))
    return list(session.scalars(stmt.order_by(s.VariableRow.name, s.VariableRow.template_id)))


def get_variable(session: Session, variable_id: int) -> s.VariableRow | None:
    return session.get(s.VariableRow, variable_id)


def create_variable(
    session: Session,
    *,
    name: str,
    label: str = "",
    description: str = "",
    template_id: int | None = None,
    default: str | None = None,
    source_field: str | None = None,
    at: datetime | None = None,
) -> s.VariableRow:
    if not valid_variable_name(name):
        raise Invalid(Msg("store.variable.bad_name", name=repr(name)))
    existing = session.scalar(
        select(s.VariableRow).where(
            s.VariableRow.name == name,
            s.VariableRow.template_id.is_(None)
            if template_id is None
            else s.VariableRow.template_id == template_id,
        )
    )
    if existing is not None:
        raise Invalid(Msg("store.variable.duplicate", name=repr(name)))
    row = s.VariableRow(
        name=name,
        label=label,
        description=description,
        template_id=template_id,
        default=default,
        source_field=source_field,
        created_at=at or utcnow(),
    )
    session.add(row)
    session.flush()
    return row


def update_variable(
    session: Session,
    variable_id: int,
    *,
    name: str | None = None,
    label: str | None = None,
    description: str | None = None,
    template_id: int | None = None,
    detach: bool = False,
    default: str | None = None,
    clear_default: bool = False,
    source_field: str | None = None,
    clear_source: bool = False,
) -> s.VariableRow | None:
    """Rename, relabel, redefault, or move a variable between "any template" and one template.

    ``clear_default`` is what ``default=None`` cannot say: None is also "leave it alone", and the
    difference between *no default* and *a default of empty* is the difference between a loud
    failure and a blank slide.
    """
    row = session.get(s.VariableRow, variable_id)
    if row is None:
        return None
    if name is not None:
        if not valid_variable_name(name):
            raise Invalid(Msg("store.variable.bad_name", name=repr(name)))
        row.name = name
    if label is not None:
        row.label = label
    if description is not None:
        row.description = description
    if clear_default:
        row.default = None
    elif default is not None:
        row.default = default
    if clear_source:
        row.source_field = None
    elif source_field is not None:
        row.source_field = source_field
    if detach:
        row.template_id = None
    elif template_id is not None:
        row.template_id = template_id
    session.flush()
    return row


def delete_variable(session: Session, variable_id: int) -> bool:
    row = session.get(s.VariableRow, variable_id)
    if row is None:
        return False
    session.execute(delete(s.VariableValueRow).where(s.VariableValueRow.variable_id == variable_id))
    session.delete(row)
    session.flush()
    return True


def list_variable_values(session: Session, variable_id: int) -> list[s.VariableValueRow]:
    return list(
        session.scalars(
            select(s.VariableValueRow)
            .where(s.VariableValueRow.variable_id == variable_id)
            .order_by(s.VariableValueRow.scope, s.VariableValueRow.scope_key)
        )
    )


def set_variable_value(
    session: Session,
    variable_id: int,
    *,
    scope: str,
    scope_key: str,
    value: str,
    at: datetime | None = None,
) -> s.VariableValueRow:
    if scope not in VARIABLE_SCOPES:
        raise Invalid(Msg("store.variable.bad_scope", scope=repr(scope)))
    if session.get(s.VariableRow, variable_id) is None:
        raise NotFound(variable_id, Msg("store.variable.not_found", id=variable_id))
    key = "" if scope == "global" else scope_key
    if scope != "global" and not key:
        raise Invalid(Msg("store.variable.scope_needs_target", scope=repr(scope)))
    row = session.scalar(
        select(s.VariableValueRow).where(
            s.VariableValueRow.variable_id == variable_id,
            s.VariableValueRow.scope == scope,
            s.VariableValueRow.scope_key == key,
        )
    )
    if row is None:
        row = s.VariableValueRow(variable_id=variable_id, scope=scope, scope_key=key)
        session.add(row)
    row.value = value
    row.updated_at = at or utcnow()
    session.flush()
    return row


def clear_variable_value(session: Session, variable_id: int, scope: str, scope_key: str) -> bool:
    key = "" if scope == "global" else scope_key
    row = session.scalar(
        select(s.VariableValueRow).where(
            s.VariableValueRow.variable_id == variable_id,
            s.VariableValueRow.scope == scope,
            s.VariableValueRow.scope_key == key,
        )
    )
    if row is None:
        return False
    session.delete(row)
    session.flush()
    return True


def _values_by_variable(session: Session, variables: Sequence[s.VariableRow]) -> dict[int, list[Any]]:
    if not variables:
        return {}
    out: dict[int, list[Any]] = {}
    rows = session.scalars(
        select(s.VariableValueRow).where(s.VariableValueRow.variable_id.in_([v.id for v in variables]))
    )
    for row in rows:
        out.setdefault(row.variable_id, []).append(row)
    return out


def resolve_variables(
    session: Session,
    *,
    template_id: int | None,
    space_key: str | None,
    board_id: int | None,
    slide_id: int | None = None,
) -> dict[str, str]:
    """What the variables say for one target, narrowest scope winning.

    A template-bound definition beats an unbound one of the same name, so a template can override a
    shared variable without renaming it.

    The registration's ``default`` is the last step of the same walk, after the global value. It is
    the **only** default there is: a name that reaches the end of the walk with nothing to say is
    left out of the result entirely, so the generator can tell "nobody filled this in" from "it
    says the empty string", and refuse the first.
    """
    wanted = {
        "slide": str(slide_id) if slide_id is not None else None,
        "board": str(board_id) if board_id is not None else None,
        "space": space_key or None,
        "global": "",
    }
    variables = list_variables(session, template_id)
    values = _values_by_variable(session, variables)
    out: dict[str, str] = {}
    # Unbound definitions first, so a template-bound one of the same name overwrites it.
    for variable in sorted(variables, key=lambda v: (v.template_id is not None, v.id)):
        for scope in _RESOLUTION:
            key = wanted.get(scope)
            if key is None:
                continue
            match = next(
                (r for r in values.get(variable.id, []) if r.scope == scope and r.scope_key == key), None
            )
            if match is not None:
                out[variable.name] = match.value
                break
        else:
            # RF-58: a variable wired to a Jira field is deliberately left out here. This layer has
            # no board data, so the field is resolved where the data is — `context.resolve` — and
            # the registration's `default` waits behind it as the last resort. Writing the default
            # in now would hide the field for ever, because a value always wins over the walk.
            if variable.source_field:
                out.pop(variable.name, None)
            elif variable.default is not None:
                out[variable.name] = variable.default
            else:
                # A template-bound row with no value must not leave an unbound row's answer
                # standing: the narrower registration is the one in force.
                out.pop(variable.name, None)
    return out


class Registration(NamedTuple):
    """One registration as the deck layer needs it: what it is called, and where it gets a value."""

    label: str
    default: str | None
    source_field: str | None


def registered_variables(session: Session, template_id: int | None = None) -> dict[str, Registration]:
    """The registry a template may use: name -> :class:`Registration`.

    This is the single source of truth for *which* variables exist. The generator asks it before
    it resolves anything, so an unregistered ``{{texto.x}}`` is an error rather than a blank.
    """
    out: dict[str, Registration] = {}
    # Unbound first, so a template-bound registration of the same name is the one that stands.
    for row in sorted(list_variables(session, template_id), key=lambda v: (v.template_id is not None, v.id)):
        out[row.name] = Registration(row.label or row.name, row.default, row.source_field)
    return out


def slide_variable_values(session: Session, template_id: int | None) -> dict[int, dict[str, str]]:
    """Slide-scoped values, by template slide id, for the whole deck in one query."""
    variables = list_variables(session, template_id)
    by_id = {v.id: v for v in variables}
    if not by_id:
        return {}
    out: dict[int, dict[str, str]] = {}
    rows = session.scalars(
        select(s.VariableValueRow).where(
            s.VariableValueRow.variable_id.in_(list(by_id)), s.VariableValueRow.scope == "slide"
        )
    )
    for row in rows:
        try:
            slide_id = int(row.scope_key)
        except ValueError:
            continue
        variable = by_id[row.variable_id]
        bucket = out.setdefault(slide_id, {})
        # A template-bound definition wins over a shared one of the same name.
        if variable.name not in bucket or variable.template_id is not None:
            bucket[variable.name] = row.value
    return out


def variable_names(session: Session, template_id: int | None = None) -> list[tuple[str, str]]:
    """Every usable name with the best label found for it, for the field picker."""
    labels: dict[str, str] = {}
    for row in list_variables(session, template_id):
        if row.label or row.name not in labels:
            labels[row.name] = row.label or labels.get(row.name, "")
    return sorted(labels.items())


def upsert_people(session: Session, people: Iterable[Person]) -> None:
    unique = {p.account_id: p for p in people}
    upsert(
        session,
        s.PersonRow,
        [{"account_id": p.account_id, "display_name": p.display_name} for p in unique.values()],
        ["account_id"],
    )


def people_names(session: Session) -> dict[str, str]:
    return {r.account_id: r.display_name for r in session.scalars(select(s.PersonRow))}


def upsert_statuses(session: Session, statuses: Iterable[Status]) -> None:
    upsert(
        session,
        s.StatusRow,
        [{"id": st.id, "name": st.name, "category": st.category.value} for st in statuses],
        ["id"],
    )


def load_statuses(session: Session) -> dict[str, Status]:
    return {
        r.id: Status(r.id, r.name, StatusCategory(r.category)) for r in session.scalars(select(s.StatusRow))
    }


def upsert_sprints(session: Session, sprints: Iterable[Sprint]) -> None:
    upsert(
        session,
        s.SprintRow,
        [
            {
                "id": sp.id,
                "board_id": sp.board_id,
                "name": sp.name,
                "state": sp.state,
                "start_at": sp.start,
                "end_at": sp.end,
                "complete_at": sp.complete,
                "goal": sp.goal,
            }
            for sp in sprints
        ],
        ["id"],
    )


def sprint_from_row(row: s.SprintRow) -> Sprint:
    return Sprint(
        row.id, row.board_id, row.name, row.state, row.start_at, row.end_at, row.complete_at, row.goal
    )


def list_sprints(session: Session, board_id: int | None = None) -> list[Sprint]:
    stmt = select(s.SprintRow)
    if board_id is not None:
        stmt = stmt.where(s.SprintRow.board_id == board_id)
    rows = session.scalars(
        stmt.order_by(s.SprintRow.start_at.is_(None), s.SprintRow.start_at, s.SprintRow.id)
    )
    return [sprint_from_row(r) for r in rows]


def get_sprint(session: Session, sprint_id: int) -> Sprint | None:
    row = session.get(s.SprintRow, sprint_id)
    return sprint_from_row(row) if row else None


# ---------------------------------------------------------------- issues


def issue_row(issue: Issue, collected_at: datetime) -> dict[str, Any]:
    return {
        "key": issue.key,
        "id": issue.id,
        "project_key": issue.project_key,
        "summary": issue.summary,
        "type_name": issue.type_name,
        "hierarchy_level": issue.hierarchy_level,
        "status_id": issue.status.id,
        "status_name": issue.status.name,
        "status_category": issue.status.category.value,
        "assignee_id": issue.assignee.account_id if issue.assignee else None,
        "assignee_name": issue.assignee.display_name if issue.assignee else None,
        "created_at": issue.created,
        "updated_at": issue.updated,
        "resolved_at": issue.resolution_date,
        "due_date": issue.due_date,
        "parent_key": issue.parent_key,
        "estimate": issue.estimate,
        "sprint_ids": list(issue.sprint_ids),
        "flagged": issue.flagged,
        "labels": list(issue.labels),
        "components": list(issue.components),
        "priority": issue.priority,
        "rank": issue.rank,
        "blocked_by": list(issue.blocked_by),
        "original_estimate_hours": issue.original_estimate_hours,
        "description": issue.description,
        "collected_at": collected_at,
    }


def issue_from_row(row: s.IssueRow) -> Issue:
    return Issue(
        key=row.key,
        id=row.id,
        project_key=row.project_key,
        summary=row.summary,
        type_name=row.type_name,
        hierarchy_level=row.hierarchy_level,
        status=Status(row.status_id, row.status_name, StatusCategory(row.status_category)),
        created=row.created_at,
        updated=row.updated_at,
        assignee=Person(row.assignee_id, row.assignee_name or row.assignee_id) if row.assignee_id else None,
        resolution_date=row.resolved_at,
        due_date=row.due_date,
        parent_key=row.parent_key,
        estimate=row.estimate,
        sprint_ids=tuple(int(x) for x in row.sprint_ids or ()),
        flagged=row.flagged,
        labels=tuple(row.labels or ()),
        components=tuple(row.components or ()),
        priority=row.priority,
        rank=row.rank,
        blocked_by=tuple(row.blocked_by or ()),
        original_estimate_hours=row.original_estimate_hours,
        description=row.description or "",
    )


def upsert_issues(session: Session, issues: Iterable[Issue], board_id: int | None, at: datetime) -> None:
    items = list({i.key: i for i in issues}.values())
    upsert(session, s.IssueRow, [issue_row(i, at) for i in items], ["key"])
    if board_id is not None:
        upsert(
            session,
            s.IssueBoardRow,
            [{"board_id": board_id, "issue_key": i.key} for i in items],
            ["board_id", "issue_key"],
            do_nothing=True,
        )
    upsert_people(session, [i.assignee for i in items if i.assignee])


def board_members_expected(session: Session, board_id: int, since: datetime) -> set[str]:
    """Members a full reconciliation must return again: every open one, and done ones updated since."""
    return set(
        session.scalars(
            select(s.IssueRow.key)
            .join(s.IssueBoardRow, s.IssueBoardRow.issue_key == s.IssueRow.key)
            .where(
                s.IssueBoardRow.board_id == board_id,
                or_(s.IssueRow.status_category != StatusCategory.DONE.value, s.IssueRow.updated_at >= since),
            )
        )
    )


def drop_board_members(session: Session, board_id: int, keys: Iterable[str]) -> None:
    """Take items off a board. The issue rows, their history and frozen snapshots all stay."""
    for chunk in _chunks(list(keys)):
        session.execute(
            delete(s.IssueBoardRow).where(
                s.IssueBoardRow.board_id == board_id, s.IssueBoardRow.issue_key.in_(chunk)
            )
        )


def board_issue_keys(session: Session, board_id: int) -> list[str]:
    return list(
        session.scalars(select(s.IssueBoardRow.issue_key).where(s.IssueBoardRow.board_id == board_id))
    )


def load_issues(
    session: Session, *, board_id: int | None = None, keys: Iterable[str] | None = None
) -> list[Issue]:
    if keys is not None:
        wanted = list(dict.fromkeys(keys))
        out: list[Issue] = []
        for chunk in _chunks(wanted):
            out += [
                issue_from_row(r)
                for r in session.scalars(select(s.IssueRow).where(s.IssueRow.key.in_(chunk)))
            ]
        return out
    stmt = select(s.IssueRow)
    if board_id is not None:
        stmt = stmt.join(s.IssueBoardRow, s.IssueBoardRow.issue_key == s.IssueRow.key).where(
            s.IssueBoardRow.board_id == board_id
        )
    return [issue_from_row(r) for r in session.scalars(stmt.order_by(s.IssueRow.key))]


def existing_issue_keys(session: Session, keys: Iterable[str]) -> set[str]:
    wanted = list(set(keys))
    found: set[str] = set()
    for chunk in _chunks(wanted):
        found |= set(session.scalars(select(s.IssueRow.key).where(s.IssueRow.key.in_(chunk))))
    return found


def mark_changelog_synced(session: Session, keys: Iterable[str], at: datetime) -> None:
    for chunk in _chunks(list(keys)):
        for row in session.scalars(select(s.IssueRow).where(s.IssueRow.key.in_(chunk))):
            row.changelog_synced_at = at


# ---------------------------------------------------------------- transitions


def transition_row(t: Transition) -> dict[str, Any]:
    return {
        "issue_key": t.issue_key,
        "history_id": t.history_id,
        "item_index": t.item_index,
        "at": t.at,
        "field": t.field.value,
        "from_id": t.from_id,
        "from_value": t.from_value,
        "to_id": t.to_id,
        "to_value": t.to_value,
        "author_id": t.author_id,
        "author_name": t.author_name,
    }


def upsert_transitions(session: Session, transitions: Iterable[Transition]) -> None:
    upsert(
        session,
        s.TransitionRow,
        [transition_row(t) for t in transitions],
        ["issue_key", "history_id", "item_index"],
        do_nothing=True,
    )


def load_transitions(session: Session, keys: Iterable[str]) -> dict[str, list[Transition]]:
    out: dict[str, list[Transition]] = {}
    for chunk in _chunks(list(dict.fromkeys(keys))):
        rows = session.scalars(
            select(s.TransitionRow)
            .where(s.TransitionRow.issue_key.in_(chunk))
            .order_by(s.TransitionRow.at, s.TransitionRow.history_id, s.TransitionRow.item_index)
        )
        for r in rows:
            out.setdefault(r.issue_key, []).append(
                Transition(
                    issue_key=r.issue_key,
                    at=r.at,
                    field=ChangeField(r.field),
                    from_id=r.from_id,
                    from_value=r.from_value,
                    to_id=r.to_id,
                    to_value=r.to_value,
                    author_id=r.author_id,
                    author_name=r.author_name,
                    history_id=r.history_id,
                    item_index=r.item_index,
                )
            )
    return out


# ---------------------------------------------------------------- checkpoints & snapshots


def ensure_checkpoint(
    session: Session,
    board_id: int,
    at: datetime,
    *,
    sprint_id: int | None = None,
    window_index: int | None = None,
) -> int:
    upsert(
        session,
        s.CheckpointRow,
        [
            {
                "board_id": board_id,
                "at": at,
                "sprint_id": sprint_id,
                "window_index": window_index,
                "created_at": utcnow(),
            }
        ],
        ["board_id", "at"],
        do_nothing=True,
    )
    return int(
        session.scalar(
            select(s.CheckpointRow.id).where(s.CheckpointRow.board_id == board_id, s.CheckpointRow.at == at)
        )
    )


def list_checkpoints(session: Session, board_id: int) -> list[s.CheckpointRow]:
    return list(
        session.scalars(
            select(s.CheckpointRow).where(s.CheckpointRow.board_id == board_id).order_by(s.CheckpointRow.at)
        )
    )


def snapshot_count(session: Session, checkpoint_id: int) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(s.SnapshotRow)
            .where(s.SnapshotRow.checkpoint_id == checkpoint_id)
        )
        or 0
    )


def save_snapshots(
    session: Session, checkpoint_id: int, rows: Iterable[Mapping[str, Any]], *, overwrite: bool = False
) -> None:
    upsert(
        session,
        s.SnapshotRow,
        [{**r, "checkpoint_id": checkpoint_id} for r in rows],
        ["checkpoint_id", "issue_key"],
        do_nothing=not overwrite,
    )


def load_snapshots(session: Session, checkpoint_id: int) -> list[s.SnapshotRow]:
    return list(
        session.scalars(
            select(s.SnapshotRow)
            .where(s.SnapshotRow.checkpoint_id == checkpoint_id)
            .order_by(s.SnapshotRow.issue_key)
        )
    )


# ---------------------------------------------------------------- commitment


def save_commitment(session: Session, sprint_id: int, rows: Iterable[Mapping[str, Any]]) -> None:
    upsert(
        session,
        s.CommitmentRow,
        [{**r, "sprint_id": sprint_id, "recorded_at": utcnow()} for r in rows],
        ["sprint_id", "issue_key"],
        do_nothing=True,
    )


def load_commitment(session: Session, sprint_id: int) -> set[str] | None:
    keys = set(
        session.scalars(select(s.CommitmentRow.issue_key).where(s.CommitmentRow.sprint_id == sprint_id))
    )
    return keys or None


# ---------------------------------------------------------------- runs


def acquire_lease(
    session: Session, name: str, holder: str, ttl: timedelta, *, now: datetime | None = None
) -> bool:
    """Take (or renew) the lease ``name`` for ``holder``; false while someone else holds it.

    One conditional UPDATE is the whole compare-and-set, which both SQLite and PostgreSQL apply
    atomically. Call it in its own transaction: nobody else sees the lease until it commits. The
    clock is the wall clock on purpose, since every process holding it must agree on one.
    """
    now = now or utcnow()
    upsert(
        session, s.LeaseRow, [{"name": name, "holder": None, "expires_at": None}], ["name"], do_nothing=True
    )
    taken = session.execute(
        update(s.LeaseRow)
        .where(
            s.LeaseRow.name == name,
            or_(s.LeaseRow.holder.is_(None), s.LeaseRow.holder == holder, s.LeaseRow.expires_at < now),
        )
        .values(holder=holder, expires_at=now + ttl)
        .execution_options(synchronize_session=False)
    )
    return taken.rowcount == 1


def release_lease(session: Session, name: str, holder: str) -> None:
    session.execute(
        update(s.LeaseRow)
        .where(s.LeaseRow.name == name, s.LeaseRow.holder == holder)
        .values(holder=None, expires_at=None)
        .execution_options(synchronize_session=False)
    )


def lease_holder(session: Session, name: str, *, now: datetime | None = None) -> str | None:
    row = session.get(s.LeaseRow, name)
    if row is None or row.holder is None or row.expires_at is None or row.expires_at <= (now or utcnow()):
        return None
    return row.holder


def start_run(session: Session, run_id: str, mode: str) -> None:
    session.add(s.CollectorRunRow(id=run_id, mode=mode, status="running", started_at=utcnow(), counters={}))


def _mirror(value: Msg | Mapping[str, Any] | str | None) -> str | None:
    """The pt-BR text stored beside a message record (R4), for old readers and ad-hoc SQL."""
    return None if value is None else render(value, STORAGE_LOCALE)  # type: ignore[arg-type]


def finish_run(
    session: Session,
    run_id: str,
    status: str,
    counters: Mapping[str, Any],
    error: Msg | str | None = None,
) -> None:
    row = session.get(s.CollectorRunRow, run_id)
    if row is not None:
        row.status = status
        row.finished_at = utcnow()
        row.counters = dict(counters)
        row.error = _mirror(error)
        row.error_i18n = error.to_json() if isinstance(error, Msg) else None


def start_board_run(session: Session, run_id: str, board_id: int) -> None:
    upsert(
        session,
        s.BoardRunRow,
        [
            {
                "run_id": run_id,
                "board_id": board_id,
                "status": "running",
                "started_at": utcnow(),
                "counters": {},
            }
        ],
        ["run_id", "board_id"],
    )


def finish_board_run(
    session: Session,
    run_id: str,
    board_id: int,
    *,
    status: str,
    counters: Mapping[str, Any],
    started_at: datetime,
    full: bool = False,
    error: Mapping[str, Any] | None = None,
) -> None:
    """``error`` is the failure's ``{"cause", "action", "message"}`` record (``$msg`` JSON, or text
    for a message nobody wrote a key for): stored as it is, with the pt-BR mirror in the old text
    columns."""
    record = dict(error) if error else None
    texts = {name: _mirror((record or {}).get(name)) for name in ("cause", "action", "message")}
    row = session.get(s.BoardRunRow, (run_id, board_id))
    now = utcnow()
    if row is not None:
        row.status = status
        row.finished_at = now
        row.counters = dict(counters)
        row.error = texts["message"]
        row.cause = texts["cause"]
        row.action = texts["action"]
        row.error_i18n = record
    board = session.get(s.BoardRow, board_id)
    if board is not None:
        if status == "success":
            board.last_success_at = started_at
            board.last_error = None
            board.last_error_i18n = None
            if full:
                board.last_full_at = started_at
        elif status == "failed":  # a cancelled run is somebody's decision, not a broken board
            board.last_error = texts["message"]
            board.last_error_i18n = record
            board.last_error_at = now


CANCEL_KEY = "collect.cancel"


def board_progress(
    session: Session,
    run_id: str,
    board_id: int,
    phase: str,
    done: int | None = None,
    total: int | None = None,
    *,
    full: bool | None = None,
) -> None:
    """RF-82: where a running board collection is, for the status screen."""
    row = session.get(s.BoardRunRow, (run_id, board_id))
    if row is not None:
        counters = {**(row.counters or {}), "phase": phase, "done": done, "total": total}
        if full is not None:
            counters["full"] = full
        row.counters = counters


def request_cancel(session: Session, run_id: str) -> None:
    set_setting(session, CANCEL_KEY, {"run_id": run_id, "at": utcnow().isoformat()})


def cancel_requested(session: Session, run_id: str) -> bool:
    return (get_setting(session, CANCEL_KEY) or {}).get("run_id") == run_id


def clear_cancel(session: Session, run_id: str) -> None:
    if cancel_requested(session, run_id):
        set_setting(session, CANCEL_KEY, None)


def typical_duration(session: Session, board_id: int, full: bool | None) -> float | None:
    """Median seconds of this board's recent successful runs of the same kind, for an ETA.

    ``full=None`` (not decided yet: the run is still reading the board) takes any kind.
    """
    rows = session.scalars(
        select(s.BoardRunRow)
        .where(s.BoardRunRow.board_id == board_id, s.BoardRunRow.status == "success")
        .order_by(s.BoardRunRow.started_at.desc())
        .limit(20)
    )
    same = [
        (r.finished_at - r.started_at).total_seconds()
        for r in rows
        if r.finished_at and (full is None or (r.counters or {}).get("full", full) == full)
    ][:5]
    return sorted(same)[len(same) // 2] if same else None


def latest_runs(session: Session, limit: int = 20) -> list[s.CollectorRunRow]:
    return list(
        session.scalars(select(s.CollectorRunRow).order_by(s.CollectorRunRow.started_at.desc()).limit(limit))
    )


def board_runs(session: Session, run_id: str) -> list[s.BoardRunRow]:
    return list(session.scalars(select(s.BoardRunRow).where(s.BoardRunRow.run_id == run_id)))


def last_board_run(session: Session, board_id: int) -> s.BoardRunRow | None:
    return session.scalars(
        select(s.BoardRunRow)
        .where(s.BoardRunRow.board_id == board_id)
        .order_by(s.BoardRunRow.started_at.desc())
        .limit(1)
    ).first()


# ---------------------------------------------------------------- absences & plans


def list_absences(session: Session) -> list[s.AbsenceRow]:
    return list(session.scalars(select(s.AbsenceRow).order_by(s.AbsenceRow.start_date)))


def absences_for(session: Session) -> list[Absence]:
    return [Absence(r.account_id, r.start_date, r.end_date) for r in list_absences(session)]


def add_absence(
    session: Session, account_id: str, start: date, end: date, note: str | None = None
) -> s.AbsenceRow:
    if end < start:
        raise Invalid(Msg("store.absence.end_before_start"))
    row = s.AbsenceRow(account_id=account_id, start_date=start, end_date=end, note=note)
    session.add(row)
    session.flush()
    return row


def delete_absence(session: Session, absence_id: int) -> None:
    session.execute(delete(s.AbsenceRow).where(s.AbsenceRow.id == absence_id))


def availability_map(session: Session) -> dict[str, Availability]:
    return {
        r.account_id: Availability(r.hours_per_day, r.allocation_pct / 100)
        for r in session.scalars(select(s.PersonAvailabilityRow))
    }


def save_availability(
    session: Session, account_id: str, *, hours_per_day: float | None, allocation_pct: int
) -> None:
    """Store a person's availability; the defaults (board's hours, 100%) are stored as *no row*."""
    if hours_per_day is not None and not 0.5 <= hours_per_day <= 24:
        raise Invalid(Msg("store.availability.hours"))
    if not 0 <= allocation_pct <= 100:
        raise Invalid(Msg("store.availability.allocation"))
    if hours_per_day is None and allocation_pct == 100:
        session.execute(
            delete(s.PersonAvailabilityRow).where(s.PersonAvailabilityRow.account_id == account_id)
        )
        return
    upsert(
        session,
        s.PersonAvailabilityRow,
        [
            {
                "account_id": account_id,
                "hours_per_day": hours_per_day,
                "allocation_pct": allocation_pct,
                "updated_at": utcnow(),
            }
        ],
        ["account_id"],
    )


def save_plan(
    session: Session, sprint_id: int, parameters: Mapping[str, Any], result: Mapping[str, Any]
) -> int:
    row = s.AllocationPlanRow(
        sprint_id=sprint_id, created_at=utcnow(), parameters=dict(parameters), result=dict(result)
    )
    session.add(row)
    session.flush()
    return row.id


def latest_plan(session: Session, sprint_id: int) -> s.AllocationPlanRow | None:
    return session.scalars(
        select(s.AllocationPlanRow)
        .where(s.AllocationPlanRow.sprint_id == sprint_id)
        .order_by(s.AllocationPlanRow.created_at.desc(), s.AllocationPlanRow.id.desc())
        .limit(1)
    ).first()


# ---------------------------------------------------------------- report templates & runs


def add_template(
    session: Session, *, name: str, filename: str, sha256: str, path: str, manifest: Mapping[str, Any]
) -> s.TemplateRow:
    row = s.TemplateRow(
        name=name, filename=filename, sha256=sha256, path=path, manifest=dict(manifest), uploaded_at=utcnow()
    )
    session.add(row)
    session.flush()
    return row


def list_templates(session: Session) -> list[s.TemplateRow]:
    return list(session.scalars(select(s.TemplateRow).order_by(s.TemplateRow.uploaded_at.desc())))


def delete_template(session: Session, template_id: int) -> bool:
    """Drop a template and everything that belongs only to it.

    The mapping and the manual edit layer are meaningless without their template, so they go with
    it. Generated runs are *not* touched: they are finished deliverables whose .pptx stands on its
    own, and losing the history of what was sent out would be worse than a dangling template id.
    """
    row = session.get(s.TemplateRow, template_id)
    if row is None:
        return False
    session.execute(delete(s.MappingRow).where(s.MappingRow.template_id == template_id))
    session.execute(delete(s.DeckEditRow).where(s.DeckEditRow.template_id == template_id))
    delete_template_extras(session, template_id)
    session.delete(row)
    session.flush()
    return True


def runs_for_template(session: Session, template_id: int) -> int:
    return int(
        session.scalar(
            select(func.count()).select_from(s.ReportRunRow).where(s.ReportRunRow.template_id == template_id)
        )
        or 0
    )


def get_mapping(session: Session, template_id: int) -> s.MappingRow | None:
    return session.get(s.MappingRow, template_id)


def save_mapping(
    session: Session, template_id: int, template_sha256: str, mapping: Mapping[str, Any]
) -> None:
    upsert(
        session,
        s.MappingRow,
        [
            {
                "template_id": template_id,
                "template_sha256": template_sha256,
                "mapping": dict(mapping),
                "updated_at": utcnow(),
            }
        ],
        ["template_id"],
    )


def add_report_run(session: Session, **values: Any) -> s.ReportRunRow:
    row = s.ReportRunRow(created_at=utcnow(), **values)
    session.add(row)
    session.flush()
    return row


def list_report_runs(session: Session, limit: int = 50) -> list[s.ReportRunRow]:
    return list(
        session.scalars(select(s.ReportRunRow).order_by(s.ReportRunRow.created_at.desc()).limit(limit))
    )


# ---------------------------------------------------------------- deck status palette (RF-62)

#: One place for the semáforo colours and their words. It used to live on every `DeckMapping`, with
#: the same form repeated in two screens, so "the green" meant whatever the last person typed in
#: whichever of them they happened to open.
DECK_PALETTE_KEY = "deck.palette"
DECK_LABELS_KEY = "deck.status_labels"


def deck_palette(session: Session) -> tuple[dict[str, str], dict[str, str]]:
    """The shared status colours and labels, falling back to the module's own defaults."""
    from cadencia.report.core.mapping import DEFAULT_PALETTE, DEFAULT_STATUS_LABELS

    palette = {**DEFAULT_PALETTE, **(get_setting(session, DECK_PALETTE_KEY) or {})}
    labels = {**DEFAULT_STATUS_LABELS, **(get_setting(session, DECK_LABELS_KEY) or {})}
    return palette, labels


def set_deck_palette(
    session: Session, palette: Mapping[str, str] | None, labels: Mapping[str, str] | None
) -> None:
    """Store the shared configuration. Only known statuses are kept, so a typo cannot add one."""
    from cadencia.report.core.mapping import DECK_STATUSES

    if palette is not None:
        set_setting(session, DECK_PALETTE_KEY, {k: v for k, v in palette.items() if k in DECK_STATUSES})
    if labels is not None:
        set_setting(session, DECK_LABELS_KEY, {k: v for k, v in labels.items() if k in DECK_STATUSES})


# ---------------------------------------------------------------- saved views (RF-75)


def list_views(session: Session) -> list[s.SavedViewRow]:
    return list(session.scalars(select(s.SavedViewRow).order_by(s.SavedViewRow.name)))


def save_view(
    session: Session, *, name: str, path: str, query: str, pinned: bool, view_id: int | None = None
) -> s.SavedViewRow:
    name, path = name.strip(), path.strip()
    if not name:
        raise Invalid(Msg("store.view.name_missing"))
    if not path.startswith("/") or path.startswith("//"):
        raise Invalid(Msg("store.view.bad_path"))
    row = session.get(s.SavedViewRow, view_id) if view_id is not None else None
    if view_id is not None and row is None:
        raise NotFound(view_id, Msg("store.view.not_found", id=view_id))
    if row is None:
        row = s.SavedViewRow(created_at=utcnow())
        session.add(row)
    row.name, row.path, row.query, row.pinned = name[:120], path[:255], query.lstrip("?"), pinned
    session.flush()
    return row


def delete_view(session: Session, view_id: int) -> bool:
    return bool(session.execute(delete(s.SavedViewRow).where(s.SavedViewRow.id == view_id)).rowcount)


# ---------------------------------------------------------------- deck versions (RF-87)

#: One rolling automatic version per window: autosave runs every second or so, and a history of
#: thousands of near-identical copies would bury the ones worth restoring.
AUTO_VERSION_WINDOW = timedelta(minutes=10)
AUTO_VERSIONS_KEPT = 50


def record_version(
    session: Session,
    template_id: int,
    kind: str,
    document: Mapping[str, Any],
    *,
    label: str = "",
    auto: bool = True,
    author: str | None = None,
    now: datetime | None = None,
) -> s.DeckVersionRow:
    now = now or utcnow()
    if auto:
        latest = session.scalars(
            select(s.DeckVersionRow)
            .where(s.DeckVersionRow.template_id == template_id, s.DeckVersionRow.kind == kind)
            .order_by(s.DeckVersionRow.id.desc())
            .limit(1)
        ).first()
        if latest is not None and latest.auto and now - latest.created_at < AUTO_VERSION_WINDOW:
            latest.document, latest.updated_at = dict(document), now
            if author:
                latest.author = author
            return latest
    row = s.DeckVersionRow(
        template_id=template_id,
        kind=kind,
        label=label.strip()[:255],
        auto=auto,
        author=author,
        document=dict(document),
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.flush()
    if auto:
        stale = session.scalars(
            select(s.DeckVersionRow.id)
            .where(
                s.DeckVersionRow.template_id == template_id,
                s.DeckVersionRow.kind == kind,
                s.DeckVersionRow.auto.is_(True),
            )
            .order_by(s.DeckVersionRow.id.desc())
            .offset(AUTO_VERSIONS_KEPT)
        ).all()
        if stale:
            session.execute(delete(s.DeckVersionRow).where(s.DeckVersionRow.id.in_(stale)))
    return row


def list_versions(session: Session, template_id: int, kind: str | None = None) -> list[s.DeckVersionRow]:
    stmt = select(s.DeckVersionRow).where(s.DeckVersionRow.template_id == template_id)
    if kind:
        stmt = stmt.where(s.DeckVersionRow.kind == kind)
    return list(session.scalars(stmt.order_by(s.DeckVersionRow.id.desc())))


def delete_template_extras(session: Session, template_id: int) -> None:
    """Versions and comments only make sense with their template."""
    session.execute(delete(s.DeckVersionRow).where(s.DeckVersionRow.template_id == template_id))
    session.execute(delete(s.DeckCommentRow).where(s.DeckCommentRow.template_id == template_id))


# ---------------------------------------------------------------- slide comments (RF-93)


def list_comments(session: Session, template_id: int) -> list[s.DeckCommentRow]:
    return list(
        session.scalars(
            select(s.DeckCommentRow)
            .where(s.DeckCommentRow.template_id == template_id)
            .order_by(s.DeckCommentRow.created_at, s.DeckCommentRow.id)
        )
    )


def add_comment(
    session: Session,
    template_id: int,
    *,
    origin_slide_id: int,
    body: str,
    author: str,
    shape_key: str | None = None,
    parent_id: int | None = None,
) -> s.DeckCommentRow:
    body = body.strip()
    if not body:
        raise Invalid(Msg("store.comment.empty"))
    if parent_id is not None:
        parent = session.get(s.DeckCommentRow, parent_id)
        if parent is None or parent.template_id != template_id:
            raise NotFound(parent_id, Msg("store.comment.not_in_template", id=parent_id))
        origin_slide_id, shape_key = parent.origin_slide_id, parent.shape_key
    row = s.DeckCommentRow(
        template_id=template_id,
        origin_slide_id=origin_slide_id,
        shape_key=shape_key,
        parent_id=parent_id,
        author=(author.strip() or "anônimo")[:255],
        body=body[:4000],
        created_at=utcnow(),
    )
    session.add(row)
    session.flush()
    return row


def resolve_comment(session: Session, comment_id: int, resolved: bool) -> s.DeckCommentRow:
    row = session.get(s.DeckCommentRow, comment_id)
    if row is None:
        raise NotFound(comment_id, Msg("store.comment.not_found", id=comment_id))
    row.resolved_at = utcnow() if resolved else None
    return row


def delete_comment(session: Session, comment_id: int) -> bool:
    session.execute(delete(s.DeckCommentRow).where(s.DeckCommentRow.parent_id == comment_id))
    return bool(session.execute(delete(s.DeckCommentRow).where(s.DeckCommentRow.id == comment_id)).rowcount)


# ---------------------------------------------------------------- epic plan: roles, members, runs

ROLE_SEEDED_KEY = "plano.papeis_semeados"
PLAN_PARAMETERS_KEY = "plano.parametros"
_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
SENIORITY_KEYS = ("junior", "pleno", "senior")


def ensure_role_seed(session: Session) -> None:
    """Seed the starting roles once. Deleting every role later does not bring them back."""
    if get_setting(session, ROLE_SEEDED_KEY):
        return
    if session.scalar(select(func.count()).select_from(s.RoleRow)) == 0:
        # CADENCIA_LOCALE, never the request's: the first person to open the roles screen should not
        # decide the language the whole team's roles are named in. A fresh, empty context reads the
        # process default (set from the settings by create_app and the CLI), past any request's.
        locale = contextvars.Context().run(current_locale)
        for position, seed in enumerate(ROLE_SEED):
            session.add(
                s.RoleRow(
                    name=render(seed["name"], locale),  # type: ignore[arg-type]
                    description=render(seed["description"], locale),  # type: ignore[arg-type]
                    color=str(seed["color"]),
                    position=position,
                    labels=list(seed["labels"]),  # type: ignore[call-overload]
                    created_at=utcnow(),
                )
            )
    set_setting(session, ROLE_SEEDED_KEY, True)
    session.flush()


def list_roles(session: Session) -> list[s.RoleRow]:
    ensure_role_seed(session)
    return list(session.scalars(select(s.RoleRow).order_by(s.RoleRow.position, s.RoleRow.name)))


def _role_values(
    name: str, description: str, color: str, position: int, labels: Sequence[str]
) -> dict[str, Any]:
    name = name.strip()
    if not name:
        raise Invalid(Msg("store.role.name_missing"))
    if not _COLOR.match(color):
        raise Invalid(Msg("store.role.bad_color"))
    clean = list(dict.fromkeys(label.strip() for label in labels if label.strip()))
    return {
        "name": name,
        "description": description.strip(),
        "color": color.lower(),
        "position": int(position),
        "labels": clean,
    }


def _check_role_name(session: Session, name: str, exclude: int | None = None) -> None:
    stmt = select(s.RoleRow.id).where(func.lower(s.RoleRow.name) == name.strip().lower())
    if exclude is not None:
        stmt = stmt.where(s.RoleRow.id != exclude)
    if session.scalar(stmt) is not None:
        raise Invalid(Msg("store.role.duplicate", name=name.strip()))


def create_role(
    session: Session, *, name: str, description: str, color: str, position: int, labels: Sequence[str]
) -> s.RoleRow:
    ensure_role_seed(session)
    values = _role_values(name, description, color, position, labels)
    _check_role_name(session, values["name"])
    row = s.RoleRow(**values, created_at=utcnow())
    session.add(row)
    session.flush()
    return row


def update_role(
    session: Session,
    role_id: int,
    *,
    name: str,
    description: str,
    color: str,
    position: int,
    labels: Sequence[str],
) -> s.RoleRow:
    row = session.get(s.RoleRow, role_id)
    if row is None:
        raise NotFound(role_id, Msg("store.role.not_found"))
    values = _role_values(name, description, color, position, labels)
    _check_role_name(session, values["name"], exclude=role_id)
    for key, value in values.items():
        setattr(row, key, value)
    session.flush()
    return row


def role_member_names(session: Session, role_id: int) -> list[str]:
    names = people_names(session)
    ids = session.scalars(select(s.MemberRoleRow.account_id).where(s.MemberRoleRow.role_id == role_id))
    return sorted((names.get(a, a) for a in ids), key=str.casefold)


def delete_role(session: Session, role_id: int) -> None:
    """Callers check subtask usage first (it needs the Jira data); members are checked here."""
    row = session.get(s.RoleRow, role_id)
    if row is None:
        raise NotFound(role_id, Msg("store.role.not_found"))
    members = role_member_names(session, role_id)
    if members:
        raise Invalid(Msg("store.role.in_use", role=row.name, people=", ".join(members)))
    session.delete(row)
    session.flush()


def subtask_issues(session: Session) -> list[Issue]:
    """Every stored subtask with its parent task, for "where is this role used"."""
    rows = session.scalars(select(s.IssueRow).where(s.IssueRow.hierarchy_level < 0))
    subtasks = [issue_from_row(r) for r in rows]
    parents = load_issues(session, keys={i.parent_key for i in subtasks if i.parent_key})
    return subtasks + parents


def epic_issues(session: Session, key: str) -> tuple[Issue | None, list[Issue]]:
    """The epic, its direct children and their children, from every board."""
    epic = session.get(s.IssueRow, key)
    tasks = [
        issue_from_row(r) for r in session.scalars(select(s.IssueRow).where(s.IssueRow.parent_key == key))
    ]
    keys = [t.key for t in tasks]
    subtasks: list[Issue] = []
    for chunk in _chunks(keys):
        subtasks += [
            issue_from_row(r)
            for r in session.scalars(select(s.IssueRow).where(s.IssueRow.parent_key.in_(chunk)))
        ]
    return (issue_from_row(epic) if epic else None), tasks + subtasks


class MemberRecord(NamedTuple):
    account_id: str
    name: str
    active: bool
    roles: list[tuple[int, str]]  # (role_id, seniority)


def list_members(session: Session) -> list[MemberRecord]:
    names = people_names(session)
    roles: dict[str, list[tuple[int, str]]] = {}
    for row in session.scalars(select(s.MemberRoleRow)):
        roles.setdefault(row.account_id, []).append((row.role_id, row.seniority))
    members = [
        MemberRecord(
            r.account_id, names.get(r.account_id, r.account_id), r.active, roles.get(r.account_id, [])
        )
        for r in session.scalars(select(s.TeamMemberRow))
    ]
    return sorted(members, key=lambda m: (m.name.casefold(), m.account_id))


def save_member(session: Session, account_id: str, *, active: bool, roles: Sequence[tuple[int, str]]) -> None:
    if session.get(s.PersonRow, account_id) is None:
        raise NotFound(account_id, Msg("store.person.not_found"))
    known = set(session.scalars(select(s.RoleRow.id)))
    seen: set[int] = set()
    for role_id, seniority in roles:
        if role_id not in known:
            raise Invalid(Msg("store.role.missing", id=role_id))
        if seniority not in SENIORITY_KEYS:
            raise Invalid(
                Msg("store.member.bad_seniority", seniority=seniority, allowed=", ".join(SENIORITY_KEYS))
            )
        if role_id in seen:
            raise Invalid(Msg("store.member.role_twice"))
        seen.add(role_id)
    upsert(session, s.TeamMemberRow, [{"account_id": account_id, "active": active}], ["account_id"])
    session.execute(delete(s.MemberRoleRow).where(s.MemberRoleRow.account_id == account_id))
    for role_id, seniority in roles:
        session.add(s.MemberRoleRow(account_id=account_id, role_id=role_id, seniority=seniority))
    session.flush()


def delete_member(session: Session, account_id: str) -> bool:
    session.execute(delete(s.MemberRoleRow).where(s.MemberRoleRow.account_id == account_id))
    return bool(
        session.execute(delete(s.TeamMemberRow).where(s.TeamMemberRow.account_id == account_id)).rowcount
    )


def plan_parameters(session: Session) -> dict[str, Any]:
    return dict(get_setting(session, PLAN_PARAMETERS_KEY) or {})


def set_plan_parameters(session: Session, values: Mapping[str, Any]) -> None:
    set_setting(session, PLAN_PARAMETERS_KEY, dict(values))


def plan_selection(session: Session, epic_key: str) -> list[str] | None:
    """Who is available for this epic; ``None`` = never chosen, meaning every active member."""
    value = get_setting(session, f"plano.selecao.{epic_key}")
    return None if value is None else [str(v) for v in value]


def set_plan_selection(session: Session, epic_key: str, account_ids: Sequence[str]) -> None:
    set_setting(session, f"plano.selecao.{epic_key}", list(dict.fromkeys(account_ids)))


def save_plan_run(session: Session, **values: Any) -> s.EpicPlanRunRow:
    row = s.EpicPlanRunRow(**values, created_at=utcnow())
    session.add(row)
    session.flush()
    return row


def latest_plan_run(session: Session, epic_key: str) -> s.EpicPlanRunRow | None:
    return session.scalars(
        select(s.EpicPlanRunRow)
        .where(s.EpicPlanRunRow.epic_key == epic_key)
        .order_by(s.EpicPlanRunRow.created_at.desc(), s.EpicPlanRunRow.id.desc())
        .limit(1)
    ).first()


def subtask_roles(session: Session) -> dict[str, tuple[int, ...]]:
    return {
        r.issue_key: tuple(int(x) for x in r.role_ids or ())
        for r in session.scalars(select(s.SubtaskRoleRow))
    }


def set_subtask_roles(session: Session, issue_key: str, role_ids: Sequence[int]) -> None:
    """Choose the role(s) of a subtask by hand; an empty list goes back to the automatic answer."""
    row = session.get(s.IssueRow, issue_key)
    if row is None or row.hierarchy_level >= 0:
        raise NotFound(issue_key, Msg("store.subtask.not_found", key=issue_key))
    ids = list(dict.fromkeys(int(r) for r in role_ids))
    if len(ids) > 2:
        raise Invalid(Msg("store.subtask.role_count"))
    known = set(session.scalars(select(s.RoleRow.id)))
    unknown = [r for r in ids if r not in known]
    if unknown:
        raise Invalid(Msg("store.subtask.unknown_roles", ids=", ".join(map(str, unknown))))
    if not ids:
        session.execute(delete(s.SubtaskRoleRow).where(s.SubtaskRoleRow.issue_key == issue_key))
    else:
        upsert(
            session,
            s.SubtaskRoleRow,
            [{"issue_key": issue_key, "role_ids": ids, "updated_at": utcnow()}],
            ["issue_key"],
        )
    session.flush()


def manual_role_usage(session: Session, role_id: int) -> list[str]:
    return sorted(k for k, ids in subtask_roles(session).items() if role_id in ids)
