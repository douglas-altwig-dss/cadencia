"""Epic plan: problems in the Jira data, the plan validator, hours and duration labels, and the
page's and API's errors."""

from __future__ import annotations

from cadencia.i18n.fmt import hours as _hours
from cadencia.i18n.fmt import listing as _listing
from cadencia.i18n.fmt import plural
from cadencia.i18n.render import Entry

_LOC = "en-US"


def _h(value: float) -> str:
    return _hours(value, _LOC)


def _list(items: list[str], limit: int = 12) -> str:
    return _listing(items, limit, _LOC)


MESSAGES: dict[str, Entry] = {
    # Seniority labels on the team.
    "seniority.junior": "Junior",
    "seniority.pleno": "Mid-level",
    "seniority.senior": "Senior",
    # The Jira field a subtask's hours are read from.
    "hours_source.original": "original estimate",
    "hours_source.estimate": "estimate field",
    # Parameters.validated().
    "parameter.range": lambda name, low, high: f"Parameter {name} must be between {low:g} and {high:g}.",
    "parameter.workday_granularity": "The workday must be a multiple of the scheduling granularity.",
    "parameter.hours_source": "Invalid hours source: {value}.",
    "parameter.empty": "Parameter {name} cannot be empty.",
    # Consistency checks on code review and card setup hours.
    "problem.code_review_without_code": "{task} is marked as having no code, "
    "but it has a code review subtask.",
    "problem.code_review_mismatch": lambda task, actual, expected, count, each: (
        f"Code review of {task}: {_h(actual)}h estimated, {_h(expected)}h expected "
        f"({count} {plural(count, 'subtask', 'subtasks')} × {_h(each)}h)."
    ),
    "problem.card_setup_mismatch": lambda actual, expected, cards, minutes: (
        f"Card setup: {_h(actual)}h estimated, {_h(expected)}h expected "
        f"({cards} {plural(cards, 'card', 'cards')} × {_h(minutes)} min)."
    ),
    # "19h · 3d 1h": hours, then whole workdays plus what is left of the last one.
    "hours_label": lambda hours, days, rest: (
        f"{_h(hours)}h" + ((f" · {days}d" + (f" {_h(rest)}h" if rest else "")) if days else "")
    ),
    # Why a subtask has no role.
    "why.no_role_label": "no role label",
    "why.not_on_team": "{name} is not on the team",
    "why.covers_roles": lambda name, count: f"{name} covers {count} {plural(count, 'role', 'roles')}",
    "why.no_role": "{name} has no role",
    "why.no_assignee": "no assignee",
    "reason_group": lambda why, keys: f"{why}: {_list(keys, 8)}",
    "rounded_item": lambda key, before, after: f"{key} ({_h(before)}h → {_h(after)}h)",
    # Problems found while reading the epic from Jira.
    "problem.no_role": lambda count, reasons: (
        f"{count} {plural(count, 'subtask', 'subtasks')} without a role ({'; '.join(reasons)}). "
        "Assign the role in “Subtask roles”, record the assignees' roles on the team "
        "or use role labels in Jira."
    ),
    "problem.too_many_roles": lambda items: (
        f"A subtask has one or two roles; these match more: {_list(items, 6)}."
    ),
    "problem.no_hours": lambda count, total, source, keys: (
        f"{count} of {total} {plural(total, 'subtask', 'subtasks')} without hours in the Jira field "
        f"“{source}”; they count as 0h: {_list(keys)}."
    ),
    "problem.rounded": lambda step, items: (
        f"Hours rounded up to the {_h(step)}h granularity: {_list(items, 6)}."
    ),
    "problem.external_dependency": lambda items: (
        f"Dependencies on items outside the epic were ignored: {_list(items, 8)}."
    ),
    "problem.empty_tasks": lambda count, keys: (
        f"{count} {plural(count, 'task', 'tasks')} without subtasks add no hours: {_list(keys)}."
    ),
    # Problems that block a schedule.
    "problem.cycle": "Circular dependency between subtasks: {path}.",
    "problem.role_without_member": lambda role, keys: (
        f"No selected member covers the role {role}; affected subtasks: {', '.join(keys)}."
    ),
    "problem.composite_without_pair": lambda keys: (
        "Composite subtasks need two different people, and only one selected person "
        f"covers both roles: {', '.join(keys)}."
    ),
    "problems": lambda items: " ".join(items),
    # The plan validator.
    "violation.unknown_subtask": "{key} is not part of the epic.",
    "violation.roles_once": "{key} is not allocated exactly once for each role it requires.",
    "violation.same_person": "{key} is composite and has the same person in both slots.",
    "violation.not_together": "{key} is composite and its two slots do not happen at the same time.",
    "violation.not_selected": "{key} was allocated to {worker}, who is not selected.",
    "violation.lacks_role": "{key} was allocated to {worker}, who does not have the required role.",
    "violation.duration": "{key} does not take its duration in continuous working hours.",
    "violation.prerequisite": "{key} starts before its prerequisite {prerequisite} ends.",
    "violation.overlap": "{name} is on {first} and {second} at the same time.",
    "violation.workday": "{name} goes over the workday on day {day}.",
    # Plan duration (the page's label; the deck keeps the pt-BR one).
    "duration": lambda planning, execution, total: (
        f"Planning {planning} d + Execution {execution} d = Total {total} working "
        f"{plural(total, 'day', 'days')}"
    ),
    "task_hours": lambda work, review: f"{_h(work)}h" + (f" + {_h(review)}h" if review else ""),
    # Errors of the page and the planning API.
    "error.not_collected": "The epic {key} was not collected from Jira.",
    "error.unknown_parameter": "Unknown parameter: {name}.",
    "error.hours_source": lambda value, options: (
        f"Invalid hours source: {value}. Use {' or '.join(options)}."
    ),
    "error.unknown_members": lambda ids: (
        f"Members that do not exist, are inactive or have no role: {', '.join(ids)}."
    ),
    "error.no_subtasks": "The epic {key} has no subtasks to plan.",
    "error.time_limit": "The time limit must be between {low} and {high} seconds.",
    "error.unknown_selection": lambda ids: f"Unknown members: {', '.join(ids)}.",
    # Deleting a role that is still in use.
    "role_in_use.members": lambda names: f"assigned to {', '.join(names)}",
    "role_in_use.subtasks": lambda keys: f"used by the subtasks {_list(keys, 10)}",
    "role_in_use.message": lambda role, places: f"The role {role} is in use: {'; '.join(places)}.",
}
