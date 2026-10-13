"""Epic plan domain: section 5's numbers, the Jira reading, the validator, list scheduling and the
exact solvers."""

from __future__ import annotations

from dataclasses import replace

import pytest

from cadencia.domain.epic_plan import hours as h
from cadencia.domain.epic_plan.from_jira import description_sections, epic_from_issues
from cadencia.domain.epic_plan.graph import subtask_cycles, task_dependencies
from cadencia.domain.epic_plan.model import (
    Epic,
    Kind,
    Member,
    MemberRole,
    Parameters,
    Phase,
    Role,
    Subtask,
    Task,
)
from cadencia.domain.epic_plan.schedule import (
    Allocation,
    Schedule,
    baseline_workers,
    blocking_problems,
    build_problem,
    list_schedule,
    member_workers,
    validate,
)
from cadencia.domain.epic_plan.timeline import duration, task_segments, total_days, weekly_load, weeks
from cadencia.domain.models import Person
from cadencia.errors import Invalid
from cadencia.jira.fields import FieldMap
from cadencia.jira.mapping import adf_text, issue_from_payload
from cadencia.planner.solvers import OPTIMAL, solve_cpsat, solve_milp
from tests.factories import issue as make_issue

PARAMS = Parameters()
ARCH, BACK, DATA, TL = (
    Role(1, "Arquiteto", order=0, labels=("arquitetura",)),
    Role(2, "Backend", order=1, labels=("backend",)),
    Role(3, "Dados", order=2, labels=("dados",)),
    Role(4, "Tech Leader", order=3, labels=("tech-lead",)),
)
ROLES = [ARCH, BACK, DATA, TL]


def member(mid: str, *roles: int) -> Member:
    return Member(mid, mid.title(), True, tuple(MemberRole(r) for r in roles))


def epic() -> Epic:
    """Planning (arch, 4h) → two independent backend subtasks (6h each) → a composite backend+data
    integration (3h) → code review (1.5h, tech lead). One code task, one planning task."""
    tasks = (
        Task("T1", "Planejamento", Phase.PLANNING, has_code=False),
        Task("T2", "Construção", Phase.EXECUTION, has_code=True),
    )
    subtasks = (
        Subtask("S01", "T1", "Desenhar", 4, (1,)),
        Subtask("S02", "T2", "API A", 6, (2,), prerequisites=("S01",)),
        Subtask("S03", "T2", "API B", 6, (2,), prerequisites=("S01",)),
        Subtask("S04", "T2", "Integrar", 3, (2, 3), prerequisites=("S02", "S03")),
        Subtask("S05", "T2", "Code review", 1.5, (4,), Kind.CODE_REVIEW, ("S04",)),
    )
    return Epic("EP-1", "Épico", tasks, subtasks)


# ---------------------------------------------------------------------------------- section 5


def test_hours_split_planning_execution_and_overheads_without_double_counting():
    e = epic()
    assert h.planning_hours(e) == 4
    assert h.execution_hours(e) == 16.5  # 6 + 6 + 3 + 1.5: the composite counts once
    assert h.code_review_overhead(e) == 1.5  # a subset of execution, not added to it
    # Jira overhead: execution-kind subtasks of tasks with code (S02, S03, S04), not the review.
    assert h.jira_overhead_count(e) == 3 and h.jira_overhead(e, PARAMS) == 3
    assert h.epic_total(e, PARAMS) == 4 + 16.5 + 3


def test_person_hours_give_each_role_of_a_composite_the_full_hour_and_reconcile():
    e = epic()
    person = h.person_hours(e, ROLES)
    assert person == {1: 4, 2: 15, 3: 3, 4: 1.5}
    assert h.person_hours_share(person)[2] == round(15 / 23.5, 4)
    rec = h.reconciliation(e, ROLES)
    assert rec.person_hours == 23.5 and rec.composite_hours == 3
    assert rec.closes  # 23.5 − 3 = 4 + 16.5


def test_capacity_counts_a_person_once_but_every_role_they_cover():
    team = [member("ana", 1, 2), member("bia", 2), member("caio", 3)]
    assert h.real_capacity(team, PARAMS) == 3 * 30
    assert h.potential_capacity(2, team, PARAMS) == 2 * 30
    assert sum(h.potential_capacity(r.id, team, PARAMS) for r in ROLES) > h.real_capacity(team, PARAMS)


def test_hours_labels_split_whole_workdays_from_the_rest():
    assert h.hours_label(19, 6) == "19h · 3d 1h"
    assert h.hours_label(12, 6) == "12h · 2d"
    assert h.hours_label(4, 6) == "4h"
    assert h.hours_label(7.5, 6) == "7,5h · 1d 1,5h"


def test_code_review_and_card_hours_are_checked_against_the_parameters():
    e = epic()
    # 3 execution subtasks × 0.5 h = 1.5 h: S05 matches, so nothing to say.
    assert h.consistency_problems(e, PARAMS) == []
    short = replace(e, subtasks=(*e.subtasks[:4], replace(e.subtasks[4], hours=1)))
    [problem] = h.consistency_problems(short, PARAMS)
    assert problem.code == "code_review_divergente" and problem.subtasks == ("S05",)
    setup = Subtask("S06", "T1", "Cadastrar cards", 5, (1,), Kind.JIRA_SETUP)
    with_setup = replace(e, subtasks=(*e.subtasks, setup))
    [cards] = h.consistency_problems(with_setup, PARAMS)
    assert cards.code == "cadastro_divergente" and "1,5h esperadas" in cards.message  # 8 cards × 10 min


def test_parameters_refuse_a_workday_that_is_not_a_multiple_of_the_granularity():
    with pytest.raises(Invalid):
        Parameters(workday_hours=6.25).validated()
    assert Parameters.from_dict({"workday_hours": "8"}).validated().week_hours == 40


# ---------------------------------------------------------------------------------- from Jira


def _issue(key, parent, *, level=-1, labels=(), hours=None, blocked=(), description=""):
    return replace(
        make_issue(
            key,
            type_name="Subtarefa" if level < 0 else "Task",
            level=level,
            parent=parent,
            labels=labels,
            blocked_by=blocked,
        ),
        original_estimate_hours=hours,
        description=description,
    )


def test_jira_issues_become_tasks_and_subtasks_with_roles_kinds_and_prerequisites():
    issues = [
        _issue("A-2", "A-1", level=0, labels=("arquitetura", "planejamento", "sem-codigo")),
        _issue("A-3", "A-1", level=0, labels=("backend",), blocked=("A-2",), description="# Negócio\nValor."),
        _issue("A-10", "A-2", hours=4),
        _issue("A-11", "A-3", hours=2.2),  # inherits Backend from its task; rounded up to 2.5
        _issue("A-12", "A-3", labels=("backend", "dados"), hours=3, blocked=("A-11", "X-9")),
        _issue("A-13", "A-3", labels=("tech-lead", "code-review"), hours=1),
        # A task with two roles passes neither down: its unlabelled subtask has no role.
        _issue("A-4", "A-1", level=0, labels=("backend", "dados")),
        _issue("A-14", "A-4", labels=("marketing",)),  # no role, no estimate
    ]
    e = epic_from_issues("A-1", None, issues, ROLES, PARAMS)
    tasks = e.task_by_id
    assert tasks["A-2"].phase is Phase.PLANNING and not tasks["A-2"].has_code
    assert tasks["A-3"].business == "Valor."
    subs = e.subtask_by_id
    assert subs["A-10"].roles == (1,)
    assert subs["A-11"].roles == (2,) and subs["A-11"].hours == 2.5
    assert subs["A-12"].roles == (2, 3) and subs["A-12"].composite
    assert subs["A-13"].kind is Kind.CODE_REVIEW and subs["A-13"].roles == (4,)
    # A task-level link stands for every subtask of the blocking task.
    assert subs["A-11"].prerequisites == ("A-10",)
    assert subs["A-12"].prerequisites == ("A-10", "A-11")
    codes = {p.code: p for p in e.problems}
    assert codes["sem_papel"].subtasks == ("A-14",) and codes["sem_papel"].level == "erro"
    assert codes["sem_estimativa"].subtasks == ("A-14",)
    assert codes["estimativa_arredondada"].subtasks == ("A-11",)
    assert "X-9" in codes["dependencia_externa"].message


def test_description_sections_from_adf_headings_and_inline_labels():
    adf = {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Negócio"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "Por que existe."}]},
            {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Técnico"}]},
            {
                "type": "bulletList",
                "content": [
                    {
                        "type": "listItem",
                        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "fila"}]}],
                    }
                ],
            },
        ],
    }
    text = adf_text(adf)
    assert text == "### Negócio\nPor que existe.\n### Técnico\n- fila"
    assert description_sections(text) == {"business": "Por que existe.", "technical": "- fila"}
    assert description_sections("Negócio: valor\nDependências: trilha paralela") == {
        "business": "valor",
        "dependencies": "trilha paralela",
    }
    assert description_sections("Só um texto.") == {"business": "Só um texto."}


def test_mapping_reads_original_estimate_and_description():
    raw = {
        "key": "A-1",
        "fields": {
            "summary": "x",
            "issuetype": {"name": "Subtarefa", "subtask": True},
            "status": {"id": "1", "name": "A fazer", "statusCategory": {"key": "new"}},
            "created": "2026-09-01T10:00:00.000+0000",
            "timeoriginalestimate": 5400,
            "description": "texto simples",
        },
    }
    issue = issue_from_payload(raw, FieldMap())
    assert issue.original_estimate_hours == 1.5 and issue.description == "texto simples"


# ---------------------------------------------------------------------------------- graph


def test_task_dependencies_are_derived_from_subtask_prerequisites():
    e = epic()
    assert task_dependencies(e) == {"T1": (), "T2": ("T1",)}


def test_cycles_name_the_subtasks_and_block_every_schedule():
    e = epic()
    looped = replace(e, subtasks=(replace(e.subtasks[0], prerequisites=("S05",)), *e.subtasks[1:]))
    assert subtask_cycles(looped) == [("S01", "S02", "S03", "S04", "S05")]
    [problem] = blocking_problems(looped, baseline_workers(ROLES), ROLES)
    assert problem.code == "ciclo" and "S01" in problem.subtasks
    with pytest.raises(Invalid, match="circular"):
        build_problem(looped, PARAMS, baseline_workers(ROLES), ROLES)


def test_a_role_nobody_covers_names_the_affected_subtasks():
    workers = member_workers([member("ana", 1), member("bia", 2)])
    problems = blocking_problems(epic(), workers, ROLES)
    assert [(p.code, p.subtasks) for p in problems] == [
        ("papel_sem_membro", ("S04",)),
        ("papel_sem_membro", ("S05",)),
    ]
    assert "Dados" in problems[0].message and "Tech Leader" in problems[1].message


def test_a_composite_needs_two_different_people():
    workers = member_workers([member("ana", 1), member("bia", 2, 3), member("caio", 4)])
    [problem] = blocking_problems(epic(), workers, ROLES)
    assert problem.code == "composta_sem_par" and problem.subtasks == ("S04",)


# ---------------------------------------------------------------------------------- validator


def _problem(members):
    return build_problem(epic(), PARAMS, member_workers(members), ROLES)


TEAM = [member("ana", 1), member("bia", 2), member("caio", 2, 3), member("davi", 4)]


def test_the_validator_accepts_a_greedy_plan_and_refuses_each_broken_rule():
    problem = _problem(TEAM)
    plan = list_schedule(problem)
    assert validate(problem, plan) == []

    def broken(**changes):
        allocations = list(plan.allocations)
        for index, allocation in enumerate(allocations):
            if allocation.subtask_id == changes["sid"]:
                allocations[index] = replace(allocation, **changes["with"])
                if changes.get("once"):
                    break
        return validate(problem, Schedule(tuple(allocations)))

    # S02 starts before S01 (8 slots) ends.
    assert any("pré-requisito S01" in e for e in broken(sid="S02", **{"with": {"start": 0, "end": 12}}))
    # Both halves of the composite on the same person.
    assert any("mesma pessoa" in e for e in broken(sid="S04", **{"with": {"worker_id": "caio"}}))
    # A person without the role.
    assert any("não tem o papel" in e for e in broken(sid="S05", **{"with": {"worker_id": "ana"}}))
    # Stretched beyond its duration.
    s05 = next(a for a in plan.allocations if a.subtask_id == "S05")
    assert any("duração" in e for e in broken(sid="S05", **{"with": {"end": s05.end + 1}}))
    # Two subtasks at the same time for one person.
    s02 = next(a for a in plan.allocations if a.subtask_id == "S02")
    overlap = Schedule((*plan.allocations, Allocation("S99", s02.worker_id, 2, s02.start, s02.end)))
    errors = validate(problem, overlap)
    assert any("ao mesmo tempo" in e for e in errors) and any("S99" in e for e in errors)
    # A subtask left out.
    missing = Schedule(tuple(a for a in plan.allocations if a.subtask_id != "S03"))
    assert any("S03" in e for e in validate(problem, missing))


def test_the_validator_catches_a_day_beyond_the_workday():
    problem = build_problem(
        Epic(
            "E", "E", (Task("T", "T"),), (Subtask("S1", "T", "x", 3, (2,)), Subtask("S2", "T", "y", 3, (2,)))
        ),
        Parameters(workday_hours=4),
        member_workers([member("bia", 2)]),
        ROLES,
    )
    # Overlapping allocations are what pushes a day over; both errors are reported.
    plan = Schedule((Allocation("S1", "bia", 2, 0, 6), Allocation("S2", "bia", 2, 2, 8)))
    errors = validate(problem, plan)
    assert any("jornada" in e for e in errors) and any("ao mesmo tempo" in e for e in errors)


# ---------------------------------------------------------------------------------- list scheduling


def test_greedy_parallelises_independent_work_of_the_same_role():
    problem = _problem(TEAM)
    plan = list_schedule(problem)
    starts = {a.subtask_id: a.start for a in plan.allocations}
    assert starts["S02"] == starts["S03"] == 8  # both backends start right after S01 (4 h)
    composite = [a for a in plan.allocations if a.subtask_id == "S04"]
    assert {a.role_id for a in composite} == {2, 3} and len({a.worker_id for a in composite}) == 2
    # 4 + 6 + 3 + 1.5 = 14.5 h → 3 workdays of 6 h.
    assert plan.makespan == 29 and total_days(problem, plan) == 3


def test_the_baseline_has_one_person_per_role_and_chains_do_not_speed_up():
    e = epic()
    base_problem = build_problem(e, PARAMS, baseline_workers(ROLES), ROLES)
    base = list_schedule(base_problem)
    assert validate(base_problem, base) == []
    assert total_days(base_problem, base) == 4  # 4 + 6 + 6 + 3 + 1.5 = 20.5 h
    # More people help only where there is parallel work: a chain stays a chain.
    chain = replace(
        e, subtasks=(*e.subtasks[:2], replace(e.subtasks[2], prerequisites=("S02",)), *e.subtasks[3:])
    )
    crowded = build_problem(
        chain, PARAMS, member_workers([*TEAM, member("eva", 2), member("fred", 2)]), ROLES
    )
    assert list_schedule(crowded).makespan == base.makespan


def test_greedy_is_deterministic_and_keeps_floating_people_free():
    problem = _problem([member("ana", 1), member("bia", 2), member("zeca", 2, 3), member("davi", 4)])
    first, second = list_schedule(problem), list_schedule(problem)
    assert first == second
    # S02 and S03 both ready at slot 8, bia and zeca free: the single-role person goes first.
    s02 = next(a for a in first.allocations if a.subtask_id == "S02")
    assert s02.worker_id == "bia"


def test_both_schedule_tabs_measure_the_same_duration():
    e = epic()
    problem = build_problem(e, PARAMS, baseline_workers(ROLES), ROLES)
    base = list_schedule(problem)
    segments = task_segments(e, problem, base)
    assert max(s["fim"] for s in segments) == base.makespan * PARAMS.slot_hours
    by_task_role = {(s["tarefa_id"], s["papel_id"]): s for s in segments}
    # T2's backend bar holds S02, S03 and the backend half of S04, back to back.
    assert by_task_role[("T2", 2)]["subtarefas"] == ["S02", "S03", "S04"]
    assert by_task_role[("T2", 2)]["horas"] == 15


def test_a_gap_between_a_roles_subtasks_splits_the_task_bar():
    e = Epic(
        "E",
        "E",
        (Task("T", "T"), Task("U", "U")),
        (
            Subtask("S1", "T", "a", 3, (2,)),
            Subtask("S2", "U", "b", 3, (3,), prerequisites=("S1",)),
            Subtask("S3", "T", "c", 3, (2,), prerequisites=("S2",)),
        ),
    )
    problem = build_problem(e, PARAMS, baseline_workers(ROLES), ROLES)
    parts = [s for s in task_segments(e, problem, list_schedule(problem)) if s["tarefa_id"] == "T"]
    assert [(p["inicio"], p["fim"]) for p in parts] == [(0, 3), (6, 9)]


def test_weeks_count_from_the_first_execution_subtask():
    tasks = (Task("P", "Plan", Phase.PLANNING, has_code=False), Task("X", "Exec"))
    subtasks = (
        Subtask("S1", "P", "long plan", 36, (1,)),  # 6 days of planning: into the second week
        Subtask("S2", "X", "exec", 6, (2,), prerequisites=("S1",)),
    )
    e = Epic("E", "E", tasks, subtasks)
    problem = build_problem(e, PARAMS, baseline_workers(ROLES), ROLES)
    plan = list_schedule(problem)
    assert duration(e, problem, plan).as_dict()["rotulo"] == (
        "Planejamento 6 d + Execução 1 d = Total 7 dias úteis"
    )
    labels = [(w["semana"], w["planejamento"], w["papeis"]) for w in weeks(e, problem, plan, ROLES)]
    assert labels == [(-1, True, ["Arquiteto"]), (1, False, ["Arquiteto", "Backend"])]
    assert weekly_load(e, problem, plan)["papel:1"] == {-1: 30, 1: 6}


# ---------------------------------------------------------------------------------- exact solvers


def _lpt_trap() -> tuple[Epic, list[Member]]:
    """3 + 3 + 2 + 2 + 2 h for two backend people: longest-first greedy gives 7 h (two days),
    the optimum splits 3+3 / 2+2+2 = 6 h and fits one workday."""
    subtasks = tuple(
        Subtask(f"S{i}", "T", f"s{i}", hours, (2,)) for i, hours in enumerate((3, 3, 2, 2, 2), 1)
    )
    return Epic("E", "E", (Task("T", "T"),), subtasks), [member("ana", 2), member("bia", 2)]


@pytest.mark.parametrize("solver", [solve_cpsat, solve_milp], ids=["cpsat", "milp"])
def test_exact_solvers_prove_the_optimum_the_greedy_misses(solver):
    e, team = _lpt_trap()
    problem = build_problem(e, PARAMS, member_workers(team), ROLES)
    greedy = list_schedule(problem)
    assert total_days(problem, greedy) == 2
    result = solver(problem, 10)
    assert result.status == OPTIMAL and result.gap == 0
    assert result.schedule is not None and validate(problem, result.schedule) == []
    assert result.schedule.makespan == 12 and total_days(problem, result.schedule) == 1


@pytest.mark.parametrize("solver", [solve_cpsat, solve_milp], ids=["cpsat", "milp"])
def test_exact_solvers_respect_composites_and_prerequisites(solver):
    problem = _problem(TEAM)
    result = solver(problem, 10)
    assert result.schedule is not None and validate(problem, result.schedule) == []
    assert result.schedule.makespan <= list_schedule(problem).makespan


# ---------------------------------------------------------------------------------- real-world Jira shapes


def _team_issue(key, parent, who, *, labels=(), estimate=None, level=-1):
    issue = _issue(key, parent, level=level, labels=labels)
    return replace(issue, estimate=estimate, assignee=Person(f"acc-{who}", who.title()) if who else None)


def test_roles_resolve_manual_then_labels_then_assignee_then_task():
    issues = [
        _team_issue("B-2", "B-1", None, level=0),  # a task with no role label
        _team_issue("B-3", "B-1", None, level=0, labels=("backend",)),
        _team_issue("B-10", "B-2", "ana", labels=("dados",)),  # label beats the assignee
        _team_issue("B-11", "B-2", "ana"),  # assignee with one role
        _team_issue("B-12", "B-3", "bia"),  # assignee covers two roles; the task picks Backend
        _team_issue("B-13", "B-2", "bia"),  # two roles and a task with none: unresolved
        _team_issue("B-14", "B-2", "zeca"),  # not on the team
        _team_issue("B-15", "B-2", "zeca"),  # chosen by hand
    ]
    team = {"acc-ana": {1}, "acc-bia": {2, 3}}
    e = epic_from_issues("B-1", None, issues, ROLES, PARAMS, member_roles=team, manual_roles={"B-15": (4, 2)})
    subs = e.subtask_by_id
    assert (subs["B-10"].roles, subs["B-10"].role_source) == ((3,), "rotulo")
    assert (subs["B-11"].roles, subs["B-11"].role_source) == ((1,), "responsavel")
    assert (subs["B-12"].roles, subs["B-12"].role_source) == ((2,), "responsavel")
    assert subs["B-13"].roles == () and subs["B-14"].roles == ()
    # Manual wins and keeps the roles' display order; two roles make it composite.
    assert (subs["B-15"].roles, subs["B-15"].role_source) == ((2, 4), "manual")
    [missing] = [p for p in e.problems if p.code == "sem_papel"]
    assert missing.subtasks == ("B-13", "B-14")
    assert "Bia cobre 2 papéis" in missing.message and "Zeca não está na equipe" in missing.message


def test_hours_come_from_the_configured_source():
    issues = [
        _team_issue("C-2", "C-1", None, level=0, labels=("backend",)),
        replace(_team_issue("C-10", "C-2", None, estimate=8), original_estimate_hours=None),
        replace(_team_issue("C-11", "C-2", None, estimate=4), original_estimate_hours=2),
    ]
    by_original = epic_from_issues("C-1", None, issues, ROLES, PARAMS)
    assert [s.hours for s in by_original.subtasks] == [0, 2]
    assert by_original.hours_found == {"original": 1, "estimate": 2}
    [missing] = [p for p in by_original.problems if p.code == "sem_estimativa"]
    assert missing.subtasks == ("C-10",) and "estimativa original" in missing.message
    by_field = epic_from_issues("C-1", None, issues, ROLES, Parameters(hours_source="estimate"))
    assert [s.hours for s in by_field.subtasks] == [8, 4]
    assert not [p for p in by_field.problems if p.code == "sem_estimativa"]
    with pytest.raises(Invalid):
        Parameters(hours_source="pontos").validated()


def test_a_team_that_labels_by_product_still_gets_a_schedule():
    """The shape of a real board: product labels, hours in the estimate field, assignees."""
    issues = [
        _team_issue("D-2", "D-1", None, level=0, labels=("Consultant_Companion",)),
        _team_issue("D-10", "D-2", "ana", labels=("Consultant_Companion",), estimate=8),
        _team_issue("D-11", "D-2", "bia", labels=("Consultant_Companion",), estimate=12),
    ]
    team = {"acc-ana": {2}, "acc-bia": {3}}
    params = Parameters(hours_source="estimate")
    e = epic_from_issues("D-1", None, issues, ROLES, params, member_roles=team)
    assert [p.code for p in e.problems if p.level == "erro"] == []
    problem = build_problem(e, params, member_workers([member("ana", 2), member("bia", 3)]), ROLES)
    plan = list_schedule(problem)
    assert validate(problem, plan) == [] and total_days(problem, plan) == 2
