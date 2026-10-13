"""Epic plan API: the planning contract, roles and members, parameters, selection and the page."""

from __future__ import annotations

import asyncio
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

from cadencia.api.app import create_app
from cadencia.api.deps import clock
from cadencia.demo import PEOPLE, DemoJira
from cadencia.demo_seed import DEMO_TEAM
from cadencia.domain.epic_plan.schedule import Allocation, Schedule
from cadencia.planner import strategies
from cadencia.planner.solvers import HEURISTIC, SolveResult, SolverUnavailable
from cadencia.store import repo
from cadencia.store.db import make_engine, session_scope, upgrade
from tests.support import NOW, collect_demo


@pytest.fixture
def client(sessions, settings):
    demo = DemoJira(NOW, epic_plan=True)
    asyncio.run(collect_demo(demo, sessions, settings, select=(4,)))
    with session_scope(sessions) as session:
        roles = {r.name: r.id for r in repo.list_roles(session)}
        for handle, entries in DEMO_TEAM.items():
            repo.save_member(
                session, PEOPLE[handle][0], active=True, roles=[(roles[n], s) for n, s in entries]
            )
    app = create_app(settings, sessions)
    app.dependency_overrides[clock] = lambda: NOW
    with TestClient(app) as test_client:
        yield test_client


def ok(response):
    assert response.status_code < 300, response.text
    return response.json()


def view(client):
    return ok(client.get("/api/epics/ANL-1/plano"))


def role_id(client, name):
    return next(r["id"] for r in ok(client.get("/api/papeis"))["items"] if r["nome"] == name)


def test_the_page_reads_the_epic_from_jira_and_its_numbers_close(client):
    page = view(client)
    assert page["epico"]["titulo"] == "Perguntas em linguagem natural sobre planilhas"
    assert page["problemas"] == [] and page["bloqueios_base"] == [] and page["bloqueios_plano"] == []
    assert len(page["tarefas"]) == 9 and len(page["subtarefas"]) == 37
    assert page["reconciliacao"]["fecha"]
    hours = page["horas"]
    assert hours["total"] == hours["planejamento"] + hours["execucao"] + hours["jira"]
    # Nine people, four of them floating: capacity counts each person once.
    assert page["capacidade"]["real"] == 9 * 30 and len(page["capacidade"]["flutuantes"]) == 4
    base, plan = page["base"], page["plano"]
    assert base["violacoes"] == [] and plan["violacoes"] == []
    assert plan["origem"] == "automatico" and plan["algoritmo"] == "guloso"
    assert plan["ganho_dias"] == base["duracao"]["total_dias"] - plan["duracao"]["total_dias"] >= 0
    # Both schedule tabs come from the same baseline, so they end together.
    assert max(s["fim"] for s in base["segmentos_tarefa"]) == base["makespan_horas"]
    assert page["pipeline"]["notas"] and page["tarefas"][0]["depende_de"] == []


def test_planning_contract_and_the_plan_becomes_the_latest(client):
    selection = view(client)["selecao"]
    body = {"epico": "ANL-1", "algoritmo": "cpsat", "membros_ids": selection, "limite_tempo_s": 10}
    result = ok(client.post("/api/planejamento", json=body))
    assert {"status", "gap", "makespan_dias", "alocacoes"} <= set(result)
    assert result["status"] == "otimo" and result["gap"] == 0 and result["violacoes"] == []
    allocation = result["alocacoes"][0]
    assert set(allocation) == {"subtarefa_id", "membro_id", "papel_id", "inicio", "fim"}
    plan = view(client)["plano"]
    assert plan["origem"] == "armazenado" and plan["algoritmo"] == "cpsat" and plan["status"] == "otimo"
    # Deselecting somebody changes the inputs: the stored plan is stale and the greedy answers.
    ok(
        client.put(
            "/api/epics/ANL-1/plano/selecao",
            json={"membros_ids": [m for m in selection if m != "demo-bruno"]},
        )
    )
    assert view(client)["plano"]["origem"] == "automatico"


def test_every_result_is_validated_even_a_solvers(client, monkeypatch):
    def cheat(problem, _seconds):
        # Everything at slot 0 on the first candidate: prerequisites and overlaps broken.
        return SolveResult(
            "otimo",
            Schedule(
                tuple(
                    Allocation(s, problem.candidates(r)[0].id, r, 0, problem.duration[s])
                    for s in problem.subtasks
                    for r in problem.roles[s]
                )
            ),
            0.0,
        )

    monkeypatch.setitem(
        strategies.STRATEGIES, "cpsat", strategies.Strategy("cpsat", "x", "x", cheat, exact=True)
    )
    selection = view(client)["selecao"]
    result = ok(
        client.post(
            "/api/planejamento", json={"epico": "ANL-1", "algoritmo": "cpsat", "membros_ids": selection}
        )
    )
    assert result["status"] == "invalido" and result["violacoes"]
    assert view(client)["plano"]["origem"] == "automatico"  # an invalid plan is never kept


def test_without_a_solver_the_exact_options_fail_clearly_and_greedy_still_works(client, monkeypatch):
    def unavailable(_problem, _seconds):
        raise SolverUnavailable("OR-Tools não está instalado no backend.")

    for key in ("milp", "cpsat"):
        monkeypatch.setitem(
            strategies.STRATEGIES, key, strategies.Strategy(key, key, key, unavailable, exact=True)
        )
    selection = view(client)["selecao"]
    response = client.post(
        "/api/planejamento", json={"epico": "ANL-1", "algoritmo": "milp", "membros_ids": selection}
    )
    assert response.status_code == 503
    assert response.json()["detail"]["cause"] == "solver indisponível"
    greedy = ok(
        client.post(
            "/api/planejamento", json={"epico": "ANL-1", "algoritmo": "guloso", "membros_ids": selection}
        )
    )
    assert greedy["status"] == HEURISTIC and greedy["violacoes"] == []


def test_a_registered_strategy_reaches_the_picker_without_touching_the_views(client, monkeypatch):
    extra = strategies.Strategy("teste", "Estratégia de teste", "Só para o teste.", strategies.GREEDY.run)
    monkeypatch.setitem(strategies.STRATEGIES, "teste", extra)
    items = ok(client.get("/api/planejamento/algoritmos"))["items"]
    assert [i["id"] for i in items] == ["guloso", "milp", "cpsat", "teste"]
    assert next(i for i in items if i["id"] == "guloso")["padrao"]
    selection = view(client)["selecao"]
    assert (
        ok(
            client.post(
                "/api/planejamento", json={"epico": "ANL-1", "algoritmo": "teste", "membros_ids": selection}
            )
        )["violacoes"]
        == []
    )


def test_bad_planning_requests_are_explained(client):
    selection = view(client)["selecao"]
    unknown = client.post(
        "/api/planejamento", json={"epico": "ANL-1", "algoritmo": "magia", "membros_ids": selection}
    )
    assert unknown.status_code == 400 and "Algoritmo desconhecido" in unknown.json()["detail"]["message"]
    nobody = client.post(
        "/api/planejamento", json={"epico": "ANL-1", "algoritmo": "guloso", "membros_ids": []}
    )
    assert nobody.status_code == 400 and "Nenhum membro selecionado" in nobody.json()["detail"]["message"]
    assert client.get("/api/epics/NADA-1/plano").status_code == 404


def test_a_role_left_without_people_names_the_subtasks_it_blocks(client):
    frontend = role_id(client, "Frontend")
    selection = view(client)["selecao"]
    ok(
        client.put(
            "/api/epics/ANL-1/plano/selecao", json={"membros_ids": [m for m in selection if m != "demo-iris"]}
        )
    )
    page = view(client)
    assert page["plano"] is None and page["base"] is not None
    [block] = page["bloqueios_plano"]
    assert block["codigo"] == "papel_sem_membro" and len(block["subtarefas"]) == 2
    card = next(c for c in page["capacidade"]["por_papel"] if c["papel_id"] == frontend)
    assert card["sem_membro"] and card["subtarefas_afetadas"] == block["subtarefas"]


def test_roles_crud_refuses_deleting_a_role_in_use(client):
    created = ok(
        client.post(
            "/api/papeis", json={"nome": "QA", "descricao": "Testa.", "cor": "#123abc", "rotulos": ["qa"]}
        )
    )
    assert client.post("/api/papeis", json={"nome": "qa", "cor": "#123abc"}).status_code == 400
    assert client.post("/api/papeis", json={"nome": "Outro", "cor": "azul"}).status_code == 400
    renamed = ok(
        client.put(f"/api/papeis/{created['id']}", json={"nome": "Qualidade", "cor": "#123abc", "ordem": 9})
    )
    assert renamed["nome"] == "Qualidade" and renamed["ordem"] == 9
    assert client.delete(f"/api/papeis/{created['id']}").status_code == 204

    backend = role_id(client, "Backend")
    refused = client.delete(f"/api/papeis/{backend}")
    assert refused.status_code == 400
    message = refused.json()["detail"]["message"]
    assert "Bruno Lima" in message and "ANL-" in message


def test_members_get_roles_with_seniority_and_everything_follows(client):
    members = ok(client.get("/api/membros"))
    assert [m["nome"] for m in members["items"]] == sorted(
        (m["nome"] for m in members["items"]), key=str.casefold
    )
    assert members["pessoas"] == []  # every collected person is already enrolled
    frontend = role_id(client, "Frontend")
    saved = ok(
        client.put(
            "/api/membros/demo-bruno",
            json={
                "ativo": True,
                "papeis": [
                    {"papel_id": role_id(client, "Backend"), "senioridade": "senior"},
                    {"papel_id": frontend, "senioridade": "junior"},
                ],
            },
        )
    )
    assert saved["flutuante"] and saved["papeis"][1]["senioridade_rotulo"] == "Júnior"
    assert (
        client.put(
            "/api/membros/demo-bruno", json={"papeis": [{"papel_id": frontend, "senioridade": "mestre"}]}
        ).status_code
        == 400
    )
    assert client.put("/api/membros/ninguem", json={"papeis": []}).status_code == 404
    page = view(client)
    assert "demo-bruno" in page["capacidade"]["flutuantes"]
    card = next(c for c in page["capacidade"]["por_papel"] if c["papel_id"] == frontend)
    assert card["potencial"] == 60
    # An inactive member leaves the selection and the plan.
    ok(client.put("/api/membros/demo-iris", json={"ativo": False, "papeis": [{"papel_id": frontend}]}))
    assert "demo-iris" not in view(client)["selecao"]


def test_a_role_description_belongs_to_the_role_and_editing_it_keeps_every_member(client):
    """What the person's page does (item 4): the description is the role's, shared by everyone who
    has it, and changing it — or taking someone out and back in — never touches anyone else's roles."""
    backend = next(r for r in ok(client.get("/api/papeis"))["items"] if r["nome"] == "Backend")
    holders = sorted(backend["membros"])
    assert len(holders) > 1
    before = {m["id"]: m["papeis"] for m in ok(client.get("/api/membros"))["items"]}

    edited = ok(
        client.put(
            f"/api/papeis/{backend['id']}",
            json={
                "nome": backend["nome"],
                "descricao": "Serviços e APIs.",
                "cor": backend["cor"],
                "ordem": backend["ordem"],
                "rotulos": backend["rotulos"],
            },
        )
    )
    assert edited["descricao"] == "Serviços e APIs."
    again = next(r for r in ok(client.get("/api/papeis"))["items"] if r["id"] == backend["id"])
    assert sorted(again["membros"]) == holders and again["rotulos"] == backend["rotulos"]
    assert {m["id"]: m["papeis"] for m in ok(client.get("/api/membros"))["items"]} == before

    # Out of the team and back: the person shows up as not enrolled, then as enrolled again.
    assert client.delete("/api/membros/demo-bruno").status_code == 204
    assert "demo-bruno" in [p["id"] for p in ok(client.get("/api/membros"))["pessoas"]]
    ok(client.put("/api/membros/demo-bruno", json={"ativo": True, "papeis": [{"papel_id": backend["id"]}]}))
    after = {m["id"]: m["papeis"] for m in ok(client.get("/api/membros"))["items"]}
    assert set(after) == set(before)
    assert {k: v for k, v in after.items() if k != "demo-bruno"} == {
        k: v for k, v in before.items() if k != "demo-bruno"
    }


def test_parameters_change_every_view(client):
    before = view(client)
    params = ok(client.put("/api/planejamento/parametros", json={"jornada_h": 8, "overhead_jira_h": 2}))
    assert params["jornada_h"] == 8 and params["horas_semana"] == 40
    after = view(client)
    assert after["capacidade"]["real"] == 9 * 40
    assert after["horas"]["jira"] == 2 * before["horas"]["jira_subtarefas"]
    assert after["base"]["duracao"]["total_dias"] < before["base"]["duracao"]["total_dias"]
    assert client.put("/api/planejamento/parametros", json={"jornada_h": 6.2}).status_code == 400
    assert client.put("/api/planejamento/parametros", json={"inventado": 1}).status_code == 400


def test_a_dependency_cycle_blocks_every_schedule_and_names_the_subtasks(client, sessions):
    with session_scope(sessions) as session:
        issues = {i.key: i for i in repo.load_issues(session, keys=["ANL-4", "ANL-6"])}
        # ANL-4 (a subtask of the request) now waits on the design task ANL-6, whose subtasks
        # already wait on every subtask of the request: a loop.
        repo.upsert_issues(session, [replace(issues["ANL-4"], blocked_by=("ANL-6",))], None, NOW)
    page = view(client)
    assert page["base"] is None and page["plano"] is None
    [cycle] = [p for p in page["bloqueios_base"] if p["codigo"] == "ciclo"]
    assert "ANL-" in cycle["mensagem"] and len(cycle["subtarefas"]) >= 2


def test_migration_0010_adds_the_plan_to_a_database_that_predates_it(tmp_path):
    url = f"sqlite:///{tmp_path / 'cadencia.db'}"
    upgrade(url)
    engine = make_engine(url)
    with engine.begin() as connection:
        for table in ("role", "team_member", "member_role", "epic_plan_run"):
            connection.execute(text(f"DROP TABLE {table}"))
        connection.execute(text("ALTER TABLE issue DROP COLUMN description"))
        connection.execute(text("ALTER TABLE issue DROP COLUMN original_estimate_hours"))
        connection.execute(text("UPDATE alembic_version SET version_num = '0009'"))
    upgrade(url)
    inspector = inspect(engine)
    assert {"role", "team_member", "member_role", "epic_plan_run"} <= set(inspector.get_table_names())
    assert {"description", "original_estimate_hours"} <= {c["name"] for c in inspector.get_columns("issue")}


def test_a_subtask_role_chosen_by_hand_wins_and_can_be_cleared(client):
    page = view(client)
    subtask = next(s for s in page["subtarefas"] if s["origem_papel"] == "rotulo")
    backend, frontend = role_id(client, "Backend"), role_id(client, "Frontend")
    ok(client.put(f"/api/subtarefas/{subtask['id']}/papeis", json={"papeis": [frontend, backend]}))
    changed = next(s for s in view(client)["subtarefas"] if s["id"] == subtask["id"])
    assert (
        changed["origem_papel"] == "manual"
        and set(changed["papeis"]) == {backend, frontend}
        and changed["composta"]
    )
    # A role chosen by hand counts as "in use".
    refused = client.delete(f"/api/papeis/{frontend}")
    assert refused.status_code == 400 and subtask["id"] in refused.json()["detail"]["message"]
    ok(client.put(f"/api/subtarefas/{subtask['id']}/papeis", json={"papeis": []}))
    back = next(s for s in view(client)["subtarefas"] if s["id"] == subtask["id"])
    assert back["origem_papel"] == "rotulo" and back["papeis"] == subtask["papeis"]
    assert (
        client.put(f"/api/subtarefas/{subtask['id']}/papeis", json={"papeis": [1, 2, 3]}).status_code == 400
    )
    assert client.put("/api/subtarefas/ANL-2/papeis", json={"papeis": [backend]}).status_code == 404  # a task


def test_the_diagnosis_says_what_is_missing_and_the_hours_source_switches(client):
    diagnosis = view(client)["diagnostico"]
    assert diagnosis["fonte_horas"] == "estimativa_original"
    assert diagnosis["horas_encontradas"]["estimativa_original"] == diagnosis["subtarefas"] == 37
    assert diagnosis["sem_papel"] == [] and diagnosis["membros_com_papel"] == 9
    assert sum(diagnosis["papel_por_origem"].values()) == 37
    # The demo keeps no hours in the estimate field: switching empties every subtask, loudly.
    params = ok(client.put("/api/planejamento/parametros", json={"fonte_horas": "campo_estimativa"}))
    assert params["fonte_horas"] == "campo_estimativa"
    page = view(client)
    [missing] = [p for p in page["problemas"] if p["codigo"] == "sem_estimativa"]
    assert len(missing["subtarefas"]) == 37 and page["horas"]["planejamento"] == 0
    assert client.put("/api/planejamento/parametros", json={"fonte_horas": "pontos"}).status_code == 400


def test_migration_0011_adds_the_subtask_roles(tmp_path):
    url = f"sqlite:///{tmp_path / 'cadencia.db'}"
    upgrade(url)
    engine = make_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE subtask_role"))
        connection.execute(text("UPDATE alembic_version SET version_num = '0010'"))
    upgrade(url)
    assert "subtask_role" in inspect(engine).get_table_names()
