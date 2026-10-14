"""An epic plan read from Jira issues.

- **Tasks** are the epic's standard-level children; **subtasks** are theirs.
- A subtask's **roles**, first answer wins: a role somebody set on it in Cadência (``manual``);
  the roles whose labels match its Jira labels or components (``rotulo``); its assignee's role,
  when the assignee is on the team with exactly one role — or with several, of which exactly one is
  the task's (``responsavel``); the task's role, when the task matches exactly one (``tarefa``).
  One or two roles; two is a composite "A + B" subtask. Most teams label by product, not by role,
  which is why the assignee and the manual choice exist.
- **Hours** come from the source the parameters name: Jira's *original estimate*, or the estimate
  field (where story points live), which some teams fill with hours on subtasks. Rounded up to the
  agenda granularity.
- **Kind** and **phase** come from labels named in the parameters (``code-review``,
  ``cadastro-jira``, ``planejamento``, ``sem-codigo`` by default).
- **Prerequisites** are "is blocked by" links. A link to or from a *task* stands for all of that
  task's subtasks, so a team that links tasks rather than subtasks still gets a pipeline.
- **Negócio / Técnico / Dependências** are sections of the task's description, found by heading
  (in Portuguese, English or German: the heading is what the team wrote in Jira).

Nothing is guessed silently: every fallback that changes a number leaves a ``Problem`` behind.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence

from cadencia.domain.epic_plan.graph import natural_key
from cadencia.domain.epic_plan.hours import EPSILON, round_up
from cadencia.domain.epic_plan.model import (
    HOURS_SOURCES,
    Epic,
    Kind,
    Parameters,
    Phase,
    Problem,
    Role,
    Subtask,
    Task,
)
from cadencia.domain.models import HierarchyLevel, Issue
from cadencia.i18n.message import Msg

#: Description headings, normalised (accents and umlauts stripped, casefolded), as teams write
#: them in Jira — Portuguese, English and German. Input recognition only: the sections keep their
#: own names on the wire whatever language the heading was in.
_SECTIONS = {  # i18n: out of scope (Jira input matched, never shown)
    "negocio": "business",
    "business": "business",
    "fachlich": "business",
    "geschaftlich": "business",
    "tecnico": "technical",
    "technical": "technical",
    "technisch": "technical",
    "dependencia": "dependencies",
    "dependencias": "dependencies",
    "dependency": "dependencies",
    "dependencies": "dependencies",
    "abhangigkeit": "dependencies",
    "abhangigkeiten": "dependencies",
    "observacao de dependencia": "dependencies",
    "observacoes de dependencia": "dependencies",
}
_INLINE = re.compile(r"^\s*\**\s*([^:*#]{3,40}?)\s*\**\s*:\s*\**\s*(.*)$")


def normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold().strip()


def description_sections(text: str) -> dict[str, str]:
    """``business``/``technical``/``dependencies`` from a description. Headings are ``#`` lines,
    or a short line such as ``Negócio:`` — optionally followed by the text on the same line. A
    description with no recognised heading is all business context."""
    buckets: dict[str, list[str]] = {}
    current: str | None = None
    found = False
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("#"):
            current = _SECTIONS.get(normalize(line.lstrip("#").strip(" :*")))
            found = found or current is not None
            continue
        match = _INLINE.match(line)
        if match and normalize(match.group(1)) in _SECTIONS:
            current = _SECTIONS[normalize(match.group(1))]
            found = True
            if match.group(2).strip():
                buckets.setdefault(current, []).append(match.group(2).strip())
            continue
        if normalize(line.strip(" :*")) in _SECTIONS:
            current = _SECTIONS[normalize(line.strip(" :*"))]
            found = True
            continue
        if current and line:
            buckets.setdefault(current, []).append(line)
    if not found:
        return {"business": text.strip()} if text.strip() else {}
    return {k: "\n".join(v) for k, v in buckets.items()}


def _tags(issue: Issue) -> set[str]:
    return {normalize(t) for t in (*issue.labels, *issue.components)}


def roles_matching(issue: Issue, roles: Sequence[Role]) -> list[Role]:
    tags = _tags(issue)
    return [r for r in roles if tags & {normalize(label) for label in r.labels}]


def _has(issue: Issue, label: str) -> bool:
    return normalize(label) in _tags(issue)


def epic_from_issues(
    key: str,
    epic_issue: Issue | None,
    issues: Iterable[Issue],
    roles: Sequence[Role],
    params: Parameters,
    *,
    member_roles: Mapping[str, Iterable[int]] | None = None,
    manual_roles: Mapping[str, Sequence[int]] | None = None,
) -> Epic:
    """``member_roles`` maps a Jira account id to the roles that person covers on the team;
    ``manual_roles`` maps a subtask key to the roles somebody chose for it in Cadência."""
    ordered_roles = sorted(roles, key=lambda r: (r.order, r.name.casefold()))
    role_by_id = {r.id: r for r in ordered_roles}
    people = {account: frozenset(ids) for account, ids in (member_roles or {}).items()}
    manual = {k: tuple(v) for k, v in (manual_roles or {}).items() if v}
    pool = list(issues)
    tasks_raw = sorted(
        (i for i in pool if i.parent_key == key and i.hierarchy_level == HierarchyLevel.STANDARD),
        key=lambda i: (i.rank or "~", natural_key(i.key)),
    )
    task_keys = {t.key for t in tasks_raw}
    subtasks_raw = sorted(
        (i for i in pool if i.parent_key in task_keys and i.is_subtask), key=lambda i: natural_key(i.key)
    )
    children: dict[str, list[str]] = {t: [] for t in task_keys}
    for issue in subtasks_raw:
        children[issue.parent_key or ""].append(issue.key)
    subtask_keys = {s.key for s in subtasks_raw}
    problems: list[Problem] = []

    def expand(targets: Iterable[str], own_task: str) -> tuple[list[str], list[str]]:
        inside: list[str] = []
        outside: list[str] = []
        for target in targets:
            if target in subtask_keys:
                inside.append(target)
            elif target in task_keys:
                if target != own_task:
                    inside.extend(children[target])
            else:
                outside.append(target)
        return inside, outside

    tasks: list[Task] = []
    task_roles: dict[str, list[Role]] = {}
    empty_tasks: list[str] = []
    for issue in tasks_raw:
        sections = description_sections(issue.description)
        tasks.append(
            Task(
                id=issue.key,
                title=issue.summary,
                phase=Phase.PLANNING if _has(issue, params.label_planning) else Phase.EXECUTION,
                has_code=not _has(issue, params.label_no_code),
                business=sections.get("business", ""),
                technical=sections.get("technical", ""),
                dependency_note=sections.get("dependencies", ""),
                status=issue.status.name,
                done=issue.is_done,
            )
        )
        task_roles[issue.key] = roles_matching(issue, ordered_roles)
        if not children[issue.key]:
            empty_tasks.append(issue.key)

    def resolve(issue: Issue) -> tuple[list[Role], str, Msg | None]:
        """(roles, source, why-not) for one subtask."""
        chosen = [role_by_id[r] for r in manual.get(issue.key, ()) if r in role_by_id]
        if chosen:
            return sorted(chosen, key=ordered_roles.index), "manual", None
        matched = roles_matching(issue, ordered_roles)
        if matched:
            return matched, "rotulo", None
        own_task = task_roles.get(issue.parent_key or "", [])
        if issue.assignee is not None:
            name = issue.assignee.display_name
            covered = people.get(issue.assignee.account_id)
            if covered is None:
                why = Msg("epic_plan.why.not_on_team", name=name)
            elif len(covered) == 1:
                return [role_by_id[r] for r in covered if r in role_by_id], "responsavel", None
            else:
                narrowed = [r for r in own_task if r.id in covered]
                if len(narrowed) == 1:
                    return narrowed, "responsavel", None
                why = (
                    Msg("epic_plan.why.covers_roles", name=name, count=len(covered))
                    if covered
                    else Msg("epic_plan.why.no_role", name=name)
                )
        else:
            why = Msg("epic_plan.why.no_assignee")
        if len(own_task) == 1:
            return own_task, "tarefa", None
        return [], "", why

    parent_blockers = {t.key: t.blocked_by for t in tasks_raw}
    subtasks: list[Subtask] = []
    no_role: list[tuple[str, Msg]] = []
    too_many: list[str] = []
    no_hours: list[str] = []
    rounded_up: list[Msg] = []
    rounded_keys: list[str] = []
    external: list[str] = []
    found = {"original": 0, "estimate": 0}
    for issue in subtasks_raw:
        own_task = issue.parent_key or ""
        matched, source, why = resolve(issue)
        if not matched:
            no_role.append((issue.key, why or Msg("epic_plan.why.no_role_label")))
        elif len(matched) > 2:
            too_many.append(f"{issue.key} ({', '.join(r.name for r in matched)})")
        found["original"] += issue.original_estimate_hours is not None
        found["estimate"] += issue.estimate is not None
        hours = issue.original_estimate_hours if params.hours_source == "original" else issue.estimate
        if hours is None:
            no_hours.append(issue.key)
            hours = 0.0
        rounded = round_up(hours, params.slot_hours)
        if abs(rounded - hours) > EPSILON:
            rounded_up.append(Msg("epic_plan.rounded_item", key=issue.key, before=hours, after=rounded))
            rounded_keys.append(issue.key)
        own_links, own_outside = expand(issue.blocked_by, own_task)
        task_links, task_outside = expand(parent_blockers.get(own_task, ()), own_task)
        external.extend(f"{issue.key} → {outside}" for outside in (*own_outside, *task_outside))
        prerequisites = sorted({p for p in (*own_links, *task_links) if p != issue.key}, key=natural_key)
        if _has(issue, params.label_code_review):
            kind = Kind.CODE_REVIEW
        elif _has(issue, params.label_jira_setup):
            kind = Kind.JIRA_SETUP
        else:
            kind = Kind.EXECUTION
        subtasks.append(
            Subtask(
                id=issue.key,
                task_id=own_task,
                title=issue.summary,
                hours=rounded,
                roles=tuple(r.id for r in matched[:2]),
                kind=kind,
                prerequisites=tuple(prerequisites),
                status=issue.status.name,
                done=issue.is_done,
                role_source=source,
                assignee=issue.assignee.display_name if issue.assignee else "",
            )
        )

    # One problem per kind, naming every subtask: 24 separate lines hide what the fix is.
    if no_role:
        reasons: dict[Msg, list[str]] = {}
        for sub_key, why in no_role:
            reasons.setdefault(why, []).append(sub_key)
        detail = [Msg("epic_plan.reason_group", why=why, keys=keys) for why, keys in reasons.items()]
        problems.append(
            Problem(
                "erro",
                "sem_papel",
                Msg("epic_plan.problem.no_role", count=len(no_role), reasons=detail),
                tuple(k for k, _ in no_role),
            )
        )
    if too_many:
        problems.append(
            Problem(
                "erro",
                "papeis_demais",
                Msg("epic_plan.problem.too_many_roles", items=too_many),
                tuple(t.split(" ")[0] for t in too_many),
            )
        )
    if no_hours:
        problems.append(
            Problem(
                "aviso",
                "sem_estimativa",
                Msg(
                    "epic_plan.problem.no_hours",
                    count=len(no_hours),
                    total=len(subtasks_raw),
                    source=Msg(HOURS_SOURCES[params.hours_source]),
                    keys=no_hours,
                ),
                tuple(no_hours),
            )
        )
    if rounded_up:
        problems.append(
            Problem(
                "aviso",
                "estimativa_arredondada",
                Msg("epic_plan.problem.rounded", step=params.slot_hours, items=rounded_up),
                tuple(rounded_keys),
            )
        )
    if external:
        problems.append(
            Problem(
                "aviso",
                "dependencia_externa",
                Msg("epic_plan.problem.external_dependency", items=external),
                tuple(dict.fromkeys(e.split(" ")[0] for e in external)),
            )
        )
    if empty_tasks:
        problems.append(
            Problem(
                "aviso",
                "tarefa_sem_subtarefas",
                Msg("epic_plan.problem.empty_tasks", count=len(empty_tasks), keys=empty_tasks),
            )
        )
    return Epic(
        key=key,
        title=epic_issue.summary if epic_issue else key,
        tasks=tuple(tasks),
        subtasks=tuple(subtasks),
        problems=tuple(problems),
        hours_found=found,
    )
