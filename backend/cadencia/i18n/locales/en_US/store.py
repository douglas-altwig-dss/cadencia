"""What the repository refuses: boards, variables, absences, views, comments, roles and the team."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "board.not_found": "Board {board}.",
    # `fields` is a comma-separated list of setting names.
    "board.unknown_settings": "unknown fields: {fields}",
    # `name`/`scope` arrive quoted (repr), as the person typed them.
    "variable.bad_name": "invalid name: {name}",
    "variable.duplicate": "a variable named {name} already exists in this scope",
    "variable.bad_scope": "invalid scope: {scope}",
    "variable.not_found": "Variable {id} does not exist.",
    "variable.scope_needs_target": "the {scope} scope needs a target",
    "absence.end_before_start": "the absence ends before it starts",
    "availability.hours": "Hours per day must be between 0.5 and 24.",
    "availability.allocation": "Allocation must be between 0% and 100%.",
    "view.name_missing": "give the view a name",
    "view.bad_path": (
        "a view must point to a Cadência screen (a path starting with /)"  # i18n: out of scope (product name)
    ),
    "view.not_found": "View {id} does not exist.",
    "comment.empty": "the comment is empty",
    "comment.not_in_template": "Comment {id} does not exist in this template.",
    "comment.not_found": "Comment {id} does not exist.",
    "role.name_missing": "The role needs a name.",
    "role.bad_color": "The role colour must be in the #rrggbb format.",
    "role.duplicate": "A role named {name} already exists.",
    "role.not_found": "Role not found.",
    "role.in_use": "The role {role} is assigned to: {people}. Remove it from them first.",
    "role.missing": "Role {id} does not exist.",
    "person.not_found": "Person not found among the people collected from Jira.",
    "member.bad_seniority": "Invalid seniority: {seniority}. Use {allowed}.",
    "member.role_twice": "A role appears twice for the same person.",
    "subtask.not_found": "{key} is not a collected subtask.",
    "subtask.role_count": "A subtask has one or two roles.",
    "subtask.unknown_roles": "Unknown role: {ids}.",
}
