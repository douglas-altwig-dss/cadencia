"""Epic plan: the read model of every section of the plan page, and plan generation.

The only place the plan meets the store. The numbers all come from ``domain.epic_plan``; this
module chooses the inputs (which roles, which people, which epic) and shapes the output. JSON keys
are Portuguese because the planning contract (``POST /api/planejamento``) was specified that way,
and one feature speaking two languages on the wire would be worse than either.

The domain hands back messages (problems, labels, validator findings); the views end with
``localize`` so they reach the page in the request's language and the deck (``deck_summary``,
built under the deck locale) in pt-BR.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from sqlalchemy.orm import Session

from cadencia.analytics.serialize import iso, issue_url
from cadencia.domain.epic_plan import hours as h
from cadencia.domain.epic_plan.from_jira import epic_from_issues, roles_matching
from cadencia.domain.epic_plan.graph import layers, natural_key, task_dependencies
from cadencia.domain.epic_plan.model import (
    SENIORITIES,
    Epic,
    Kind,
    Member,
    MemberRole,
    Parameters,
    Problem,
    Role,
    Subtask,
)
from cadencia.domain.epic_plan.schedule import (
    Schedule,
    SchedulingProblem,
    baseline_workers,
    blocking_problems,
    build_problem,
    list_schedule,
    member_workers,
    validate,
)
from cadencia.domain.epic_plan.source import EpicSource
from cadencia.domain.epic_plan.timeline import duration, task_segments, total_days, weekly_load, weeks
from cadencia.errors import Invalid, NotFound
from cadencia.i18n import Msg, localize, tr
from cadencia.planner.solvers import FEASIBLE, HEURISTIC, OPTIMAL
from cadencia.planner.strategies import STRATEGIES, strategy
from cadencia.store import repo

KEEPABLE = (OPTIMAL, FEASIBLE, HEURISTIC)
INVALID = "invalido"
_SENTENCE = re.compile(r"(?<=[.!?])\s")


# ---------------------------------------------------------------------------------- inputs


def roles_of(session: Session) -> list[Role]:
    return [
        Role(r.id, r.name, r.description, r.color, r.position, tuple(r.labels or ()))
        for r in repo.list_roles(session)
    ]


def members_of(session: Session) -> list[Member]:
    return [
        Member(m.account_id, m.name, m.active, tuple(MemberRole(rid, sen) for rid, sen in m.roles))
        for m in repo.list_members(session)
    ]


def parameters_of(session: Session) -> Parameters:
    try:
        return Parameters.from_dict(repo.plan_parameters(session)).validated()
    except (Invalid, TypeError, ValueError):  # a hand-edited setting must not take the page down
        return Parameters()


class JiraEpicSource:
    """The epic as the collector stored it: its children and grandchildren, from every board."""

    def __init__(self, session: Session, roles: Sequence[Role], params: Parameters) -> None:
        self.session = session
        self.roles = roles
        self.params = params

    def load(self, key: str) -> Epic:
        epic_issue, issues = repo.epic_issues(self.session, key)
        if epic_issue is None and not issues:
            raise NotFound(key, Msg("epic_plan.error.not_collected", key=key))
        return epic_from_issues(
            key,
            epic_issue,
            issues,
            self.roles,
            self.params,
            # Every enrolled person, active or not: being away from this epic does not change what
            # someone's role is, and the assignee rule is about who the work belongs to.
            member_roles={m.id: m.role_ids for m in members_of(self.session)},
            manual_roles=repo.subtask_roles(self.session),
        )


def epic_source(session: Session, roles: Sequence[Role], params: Parameters) -> EpicSource:
    """The single line to change to read epics from somewhere other than Jira."""
    return JiraEpicSource(session, roles, params)


def available_members(members: Sequence[Member]) -> list[Member]:
    return [m for m in members if m.active and m.roles]


def selected_members(session: Session, key: str, members: Sequence[Member]) -> list[Member]:
    available = available_members(members)
    chosen = repo.plan_selection(session, key)
    if chosen is None:
        return available
    wanted = set(chosen)
    return [m for m in available if m.id in wanted]


def role_usage(session: Session, role_id: int, roles: Sequence[Role]) -> list[str]:
    """Stored subtasks that a role is the role of (own labels, or inherited from the task)."""
    issues = repo.subtask_issues(session)
    parents = {i.key: i for i in issues if not i.is_subtask}
    used = []
    for issue in issues:
        if not issue.is_subtask:
            continue
        matched = roles_matching(issue, roles)
        parent = parents.get(issue.parent_key or "")
        if not matched and parent is not None:
            inherited = roles_matching(parent, roles)
            matched = inherited if len(inherited) == 1 else []
        if any(r.id == role_id for r in matched):
            used.append(issue.key)
    used.extend(repo.manual_role_usage(session, role_id))
    return sorted(set(used), key=natural_key)


# ---------------------------------------------------------------------------------- serializers


def role_dict(role: Role) -> dict[str, Any]:
    return {
        "id": role.id,
        "nome": role.name,
        "descricao": role.description,
        "cor": role.color,
        "ordem": role.order,
        "rotulos": list(role.labels),
    }


def member_dict(member: Member) -> dict[str, Any]:
    return {
        "id": member.id,
        "nome": member.name,
        "ativo": member.active,
        "papeis": [
            {
                "papel_id": r.role_id,
                "senioridade": r.seniority,
                "senioridade_rotulo": tr(SENIORITIES[r.seniority]) if r.seniority in SENIORITIES else "",
            }
            for r in member.roles
        ],
        "flutuante": len(member.roles) > 1,
    }


def parameters_dict(params: Parameters) -> dict[str, Any]:
    return {
        "jornada_h": params.workday_hours,
        "overhead_jira_h": params.jira_overhead_hours,
        "code_review_h": params.code_review_hours,
        "cadastro_card_min": params.card_minutes,
        "granularidade_h": params.slot_hours,
        "limite_solver_s": params.solver_seconds,
        "rotulo_code_review": params.label_code_review,
        "rotulo_cadastro_jira": params.label_jira_setup,
        "rotulo_planejamento": params.label_planning,
        "rotulo_sem_codigo": params.label_no_code,
        "fonte_horas": HOURS_SOURCE_NAMES[params.hours_source],
        "horas_semana": params.week_hours,
    }


PARAMETER_NAMES = {
    "jornada_h": "workday_hours",
    "overhead_jira_h": "jira_overhead_hours",
    "code_review_h": "code_review_hours",
    "cadastro_card_min": "card_minutes",
    "granularidade_h": "slot_hours",
    "limite_solver_s": "solver_seconds",
    "rotulo_code_review": "label_code_review",
    "rotulo_cadastro_jira": "label_jira_setup",
    "rotulo_planejamento": "label_planning",
    "rotulo_sem_codigo": "label_no_code",
    "fonte_horas": "hours_source",
}

#: The hours source as the API names it.
HOURS_SOURCE_NAMES = {"original": "estimativa_original", "estimate": "campo_estimativa"}


def parameters_from(values: dict[str, Any] | None) -> dict[str, Any]:
    """The API's Portuguese parameter names → ``Parameters`` field names (unknown ones refused)."""
    out: dict[str, Any] = {}
    for key, value in (values or {}).items():
        if key == "horas_semana":
            continue
        if key not in PARAMETER_NAMES:
            raise Invalid(Msg("epic_plan.error.unknown_parameter", name=key))
        if key == "fonte_horas":
            back = {v: k for k, v in HOURS_SOURCE_NAMES.items()}
            if value not in back:
                raise Invalid(Msg("epic_plan.error.hours_source", value=str(value), options=list(back)))
            value = back[value]
        out[PARAMETER_NAMES[key]] = value
    return out


def save_parameters(session: Session, values: dict[str, Any]) -> Parameters:
    params = parameters_of(session).merged(parameters_from(values)).validated()
    repo.set_plan_parameters(session, params.as_dict())
    return params


def _summary(text: str, limit: int = 110) -> str:
    first = _SENTENCE.split(text.strip().replace("\n", " "), maxsplit=1)[0] if text.strip() else ""
    return first if len(first) <= limit else first[: limit - 1].rstrip() + "…"


def _ordered_roles(role_ids: Sequence[int] | set[int], roles: Sequence[Role]) -> list[int]:
    order = {r.id: i for i, r in enumerate(roles)}
    return sorted({r for r in role_ids if r in order}, key=lambda r: order[r])


def subtask_dict(subtask: Subtask, params: Parameters, base_url: str | None) -> dict[str, Any]:
    return {
        "id": subtask.id,
        "tarefa_id": subtask.task_id,
        "titulo": subtask.title,
        "horas": subtask.hours,
        "rotulo_horas": h.hours_label(subtask.hours, params.workday_hours),
        "papeis": list(subtask.roles),
        "tipo": subtask.kind.value,
        "composta": subtask.composite,
        "prerequisitos": list(subtask.prerequisites),
        "status": subtask.status,
        "concluida": subtask.done,
        "origem_papel": subtask.role_source or None,
        "responsavel": subtask.assignee or None,
        "url": issue_url(base_url, subtask.id),
    }


def tasks_view(
    epic: Epic, roles: Sequence[Role], params: Parameters, base_url: str | None
) -> list[dict[str, Any]]:
    depends = task_dependencies(epic)
    out = []
    for task in epic.tasks:
        subtasks = epic.subtasks_of(task.id)
        review = round(sum(s.hours for s in subtasks if s.kind is Kind.CODE_REVIEW), 4)
        work = round(sum(s.hours for s in subtasks if s.kind is not Kind.CODE_REVIEW), 4)
        label = Msg("epic_plan.task_hours", work=work, review=review)
        out.append(
            {
                "id": task.id,
                "titulo": task.title,
                "fase": task.phase.value,
                "tem_codigo": task.has_code,
                "negocio": task.business,
                "tecnico": task.technical,
                "observacao_dependencia": task.dependency_note,
                "resumo": _summary(task.business or task.technical),
                "status": task.status,
                "concluida": task.done,
                "horas_execucao": work,
                "horas_code_review": review,
                "horas": round(work + review, 4),
                "rotulo_horas": label,
                "papeis": _ordered_roles({r for s in subtasks for r in s.roles}, roles),
                "depende_de": list(depends.get(task.id, ())),
                "subtarefas": [s.id for s in sorted(subtasks, key=lambda s: natural_key(s.id))],
                "url": issue_url(base_url, task.id),
            }
        )
    return out


def pipeline_view(epic: Epic) -> dict[str, Any]:
    depends = task_dependencies(epic)
    task_ids = [t.id for t in epic.tasks]
    task_layer = layers(task_ids, depends)
    sub_ids = [s.id for s in sorted(epic.subtasks, key=lambda s: natural_key(s.id))]
    sub_layer = layers(sub_ids, {s.id: s.prerequisites for s in epic.subtasks})
    return {
        "tarefas": {
            "nos": [{"id": t, "camada": task_layer[t]} for t in task_ids],
            "arestas": [{"de": d, "para": t} for t in task_ids for d in depends.get(t, ())],
        },
        "subtarefas": {
            "nos": [{"id": sid, "camada": sub_layer[sid]} for sid in sub_ids],
            "arestas": [
                {"de": p, "para": st.id} for st in epic.subtasks for p in st.prerequisites if p in sub_layer
            ],
        },
        "notas": [
            {"tarefa_id": t.id, "titulo": t.title, "texto": t.dependency_note}
            for t in epic.tasks
            if t.dependency_note
        ],
    }


def schedule_view(
    epic: Epic, problem: SchedulingProblem, schedule: Schedule, roles: Sequence[Role]
) -> dict[str, Any]:
    params = problem.params
    return {
        "alocacoes": schedule.to_contract(params),
        "makespan_horas": round(schedule.makespan * params.slot_hours, 4),
        "makespan_dias": total_days(problem, schedule),
        "duracao": duration(epic, problem, schedule).as_dict(),
        "semanas": weeks(epic, problem, schedule, roles),
        "violacoes": validate(problem, schedule),
    }


# ---------------------------------------------------------------------------------- the page


def plan_view(session: Session, key: str, base_url: str | None = None) -> dict[str, Any]:
    """The whole Plano tab, rendered in the ambient locale (the request's; pt-BR for the deck)."""
    params = parameters_of(session)
    roles = roles_of(session)
    members = members_of(session)
    epic = epic_source(session, roles, params).load(key)
    selected = selected_members(session, key, members)
    selected_ids = {m.id for m in selected}
    problems: list[Problem] = [*epic.problems, *h.consistency_problems(epic, params)]

    person = h.person_hours(epic, roles)
    share = h.person_hours_share(person)
    subtasks_by_role: dict[int, list[str]] = {r.id: [] for r in roles}
    for subtask in epic.subtasks:
        for role_id in subtask.roles:
            subtasks_by_role.setdefault(role_id, []).append(subtask.id)

    used_roles = [r for r in roles if subtasks_by_role.get(r.id)]
    base_block = blocking_problems(epic, baseline_workers(used_roles), roles)
    baseline: dict[str, Any] | None = None
    if not base_block and epic.subtasks:
        base_problem = build_problem(epic, params, baseline_workers(used_roles), roles)
        base_schedule = list_schedule(base_problem)
        baseline = {
            **schedule_view(epic, base_problem, base_schedule, roles),
            "segmentos_tarefa": task_segments(epic, base_problem, base_schedule),
        }

    workers = member_workers(selected)
    plan_block = [
        p for p in blocking_problems(epic, workers, roles) if p.code not in {b.code for b in base_block}
    ]
    plan: dict[str, Any] | None = None
    load: dict[str, dict[int, float]] = {}
    if not base_block and not plan_block and epic.subtasks:
        problem = build_problem(epic, params, workers, roles)
        stored = repo.latest_plan_run(session, key)
        if stored is not None and stored.fingerprint == problem.fingerprint() and stored.status in KEEPABLE:
            schedule = Schedule.from_contract(stored.allocations, params)
            meta: dict[str, Any] = {
                "algoritmo": stored.algorithm,
                "status": stored.status,
                "gap": stored.gap,
                "origem": "armazenado",
                "gerado_em": iso(stored.created_at),
                "tempo_s": stored.seconds,
            }
        else:
            schedule = list_schedule(problem)
            meta = {
                "algoritmo": "guloso",
                "status": HEURISTIC,
                "gap": None,
                "origem": "automatico",
                "gerado_em": None,
                "tempo_s": 0.0,
            }
        view = schedule_view(epic, problem, schedule, roles)
        plan = {
            **meta,
            "algoritmo_nome": STRATEGIES[meta["algoritmo"]].name
            if meta["algoritmo"] in STRATEGIES
            else meta["algoritmo"],
            **view,
        }
        if baseline is not None:
            plan["ganho_dias"] = baseline["duracao"]["total_dias"] - view["duracao"]["total_dias"]
        load = weekly_load(epic, problem, schedule)

    view = {
        "epico": {"key": epic.key, "titulo": epic.title, "url": issue_url(base_url, epic.key)},
        "parametros": parameters_dict(params),
        "papeis": [role_dict(r) for r in roles],
        "membros": [member_dict(m) for m in members],
        "selecao": sorted(
            selected_ids, key=lambda i: next((m.name.casefold() for m in members if m.id == i), i)
        ),
        "tarefas": tasks_view(epic, roles, params, base_url),
        "subtarefas": [
            subtask_dict(st, params, base_url)
            for st in sorted(epic.subtasks, key=lambda st: natural_key(st.id))
        ],
        "problemas": [p.as_dict() for p in problems],
        "bloqueios_base": [p.as_dict() for p in base_block],
        "bloqueios_plano": [p.as_dict() for p in plan_block],
        "horas": {
            "planejamento": h.planning_hours(epic),
            "execucao": h.execution_hours(epic),
            "code_review": h.code_review_overhead(epic),
            "jira": h.jira_overhead(epic, params),
            "jira_subtarefas": h.jira_overhead_count(epic),
            "total": h.epic_total(epic, params),
        },
        "por_papel": [
            {
                "papel_id": r.id,
                "horas_pessoa": person.get(r.id, 0.0),
                "percentual": share.get(r.id),
                "subtarefas": len(subtasks_by_role.get(r.id, [])),
                "tarefas": len({epic.subtask_by_id[sid].task_id for sid in subtasks_by_role.get(r.id, [])}),
            }
            for r in roles
        ],
        "reconciliacao": h.reconciliation(epic, roles).as_dict(),
        "capacidade": capacity_view(selected, roles, params, subtasks_by_role, load),
        "diagnostico": {
            "fonte_horas": HOURS_SOURCE_NAMES[params.hours_source],
            "horas_encontradas": {HOURS_SOURCE_NAMES[k]: n for k, n in epic.hours_found.items()},
            "subtarefas": len(epic.subtasks),
            "sem_papel": [s.id for s in epic.subtasks if not s.roles],
            "papel_por_origem": {
                origin: sum(1 for s in epic.subtasks if s.role_source == origin)
                for origin in ("manual", "rotulo", "responsavel", "tarefa")
            },
            "membros_com_papel": len(available_members(members)),
        },
        "pipeline": pipeline_view(epic),
        "base": baseline,
        "plano": plan,
    }
    return localize(view)


def capacity_view(
    selected: Sequence[Member],
    roles: Sequence[Role],
    params: Parameters,
    subtasks_by_role: dict[int, list[str]],
    load: dict[str, dict[int, float]],
) -> dict[str, Any]:
    week = params.week_hours
    per_member = []
    for member in selected:
        weeks_load = load.get(member.id, {})
        per_member.append(
            {
                "membro_id": member.id,
                "capacidade_semanal": week,
                "semanas": [
                    {"semana": number, "horas": hours, "ocupacao": round(hours / week, 4) if week else None}
                    for number, hours in sorted(weeks_load.items())
                ],
                "horas_total": round(sum(weeks_load.values()), 4),
            }
        )
    return {
        "pessoas": len(selected),
        "real": h.real_capacity(selected, params),
        "flutuantes": [m.id for m in selected if len(m.roles) > 1],
        "por_papel": [
            {
                "papel_id": r.id,
                "potencial": h.potential_capacity(r.id, selected, params),
                "membros": [m.id for m in selected if r.id in m.role_ids],
                "sem_membro": not any(r.id in m.role_ids for m in selected),
                "subtarefas_afetadas": subtasks_by_role.get(r.id, [])
                if not any(r.id in m.role_ids for m in selected)
                else [],
            }
            for r in roles
        ],
        "por_membro": per_member,
    }


# ---------------------------------------------------------------------------------- generation


def generate_plan(
    session: Session,
    *,
    epic_key: str,
    algorithm: str,
    member_ids: Sequence[str],
    overrides: dict[str, Any] | None = None,
    time_limit: float | None = None,
) -> dict[str, Any]:
    """Run one strategy, validate what it returns — whoever produced it — and keep a valid plan
    as the epic's latest. ``SolverUnavailable`` propagates for the API to explain."""
    chosen = strategy(algorithm)
    params = parameters_of(session).merged(parameters_from(overrides)).validated()
    roles = roles_of(session)
    epic = epic_source(session, roles, params).load(epic_key)
    available = {m.id: m for m in available_members(members_of(session))}
    unknown = [i for i in member_ids if i not in available]
    if unknown:
        raise Invalid(Msg("epic_plan.error.unknown_members", ids=unknown))
    if not epic.subtasks:
        raise Invalid(Msg("epic_plan.error.no_subtasks", key=epic_key))
    workers = member_workers(available[i] for i in dict.fromkeys(member_ids))
    problem = build_problem(epic, params, workers, roles)
    limit = float(time_limit if time_limit is not None else params.solver_seconds)
    if not 1 <= limit <= 600:
        raise Invalid(Msg("epic_plan.error.time_limit", low=1, high=600))
    result = chosen.run(problem, limit)
    out: dict[str, Any] = {
        "algoritmo": chosen.id,
        "status": result.status,
        "gap": result.gap,
        "tempo_s": result.seconds,
        "makespan_dias": None,
        "alocacoes": [],
        "violacoes": [],
        "duracao": None,
    }
    if result.schedule is None:
        return localize(out)
    violations = validate(problem, result.schedule)
    out.update(
        makespan_dias=total_days(problem, result.schedule),
        alocacoes=result.schedule.to_contract(params),
        violacoes=violations,
        duracao=duration(epic, problem, result.schedule).as_dict(),
    )
    if violations:
        out["status"] = INVALID
        return localize(out)
    run = repo.save_plan_run(
        session,
        epic_key=epic_key,
        algorithm=chosen.id,
        status=result.status,
        gap=result.gap,
        makespan_days=out["makespan_dias"],
        member_ids=[w.id for w in workers],
        parameters=params.as_dict(),
        allocations=out["alocacoes"],
        fingerprint=problem.fingerprint(),
        seconds=result.seconds,
    )
    out["id"] = run.id
    return localize(out)


# ---------------------------------------------------------------------------------- deck (#1)

#: Epics per board the deck summarises; more than this does not fit a slide anyway.
DECK_EPICS = 6


def deck_summary(session: Session, key: str, base_url: str | None = None) -> dict[str, Any] | None:
    """One epic's plan as the deck needs it, read through the very view the Plano tab draws, so a
    slide and the page can never disagree. None when the epic was not collected."""
    try:
        view = plan_view(session, key, base_url)
    except NotFound:
        return None
    roles = {r["id"]: r for r in view["papeis"]}
    members = {m["id"]: m["nome"] for m in view["membros"]}
    subtasks = {s["id"]: s for s in view["subtarefas"]}
    plan, base = view["plano"], view["base"]
    blocks = view["bloqueios_base"] + view["bloqueios_plano"]
    summary: dict[str, Any] = {
        "key": key,
        "title": view["epico"]["titulo"],
        "hours": view["horas"]["total"],
        "base_days": base["duracao"]["total_dias"] if base else None,
        "plan_days": plan["duracao"]["total_dias"] if plan else None,
        "gain_days": plan.get("ganho_dias") if plan else None,
        "algorithm": plan["algoritmo_nome"] if plan else "",
        # The plan's state as the deck prints it.
        "state": "pronto"  # deck text: pt-BR by design (docs/i18n.md)
        if plan
        else (
            "bloqueado: " + blocks[0]["codigo"].replace("_", " ")  # deck text: pt-BR by design (docs/i18n.md)
            if blocks
            else "sem subtarefas"  # deck text: pt-BR by design (docs/i18n.md)
        ),
        "duration_label": plan["duracao"]["rotulo"] if plan else "",
        "workday": view["parametros"]["jornada_h"],
        "role_hours": [
            {"name": roles[r["papel_id"]]["nome"], "hours": r["horas_pessoa"]}
            for r in view["por_papel"]
            if r["horas_pessoa"] > 0 and r["papel_id"] in roles
        ],
    }
    if plan:
        lanes: list[str] = []
        bars = []
        for allocation in plan["alocacoes"]:
            if allocation["fim"] <= allocation["inicio"]:
                continue
            role = roles.get(allocation["papel_id"], {})
            lane = f"{members.get(allocation['membro_id'], allocation['membro_id'])} · {role.get('nome', '')}"
            if lane not in lanes:
                lanes.append(lane)
            bars.append(
                {
                    "lane": lane,
                    "start": allocation["inicio"],
                    "end": allocation["fim"],
                    "color": role.get("cor"),
                    "label": allocation["subtarefa_id"],
                    "title": subtasks.get(allocation["subtarefa_id"], {}).get("titulo", ""),
                }
            )
        summary["lanes"] = lanes
        summary["bars"] = bars
    return summary


def board_epic_summaries(
    session: Session, epic_keys: Sequence[str], base_url: str | None = None
) -> list[dict[str, Any]]:
    """The plans of the given epics, the ones with a plan first, then by hours."""
    summaries = [
        s
        for key in list(dict.fromkeys(epic_keys))[: DECK_EPICS * 2]
        if (s := deck_summary(session, key, base_url))
    ]
    summaries = [s for s in summaries if s["hours"] > 0]
    summaries.sort(key=lambda s: (s["plan_days"] is None, -s["hours"], s["key"]))
    return summaries[:DECK_EPICS]
