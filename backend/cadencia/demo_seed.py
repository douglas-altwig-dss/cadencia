"""`cadencia demo`: fill a database with the fictional instance so the product can be explored
without Jira credentials. It runs the real collector against :class:`cadencia.demo.DemoJira` and
registers the sample template with its suggested mapping."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from cadencia.collector.service import Collector
from cadencia.config import Settings
from cadencia.demo import BASE_URL, PEOPLE, DemoJira
from cadencia.jira.client import JiraClient
from cadencia.report.core.mapping import DeckMapping
from cadencia.report.core.sample_template import build_sample_template
from cadencia.report.core.suggest import as_repeat, suggest_mapping
from cadencia.report.service import store_template
from cadencia.store import repo
from cadencia.store.db import session_scope

# The epic plan's team: who covers which role. Four people cover two roles (floating capacity).
DEMO_TEAM: dict[str, list[tuple[str, str]]] = {
    "ana": [("PM/PO", "senior")],
    "bruno": [("Backend", "pleno")],
    "carla": [("Tech Leader", "senior"), ("Infraestrutura", "junior")],
    "diego": [("Cientista de Dados / Engenheiro de Dados", "junior"), ("Backend", "junior")],
    "elisa": [("Infraestrutura", "pleno")],
    "fabio": [("Arquiteto de Software", "senior"), ("Infraestrutura", "pleno")],
    "gabriela": [("Backend", "pleno"), ("Cientista de Dados / Engenheiro de Dados", "pleno")],
    "heitor": [("Cientista de Dados / Engenheiro de Dados", "senior")],
    "iris": [("Frontend", "pleno")],
}


def demo_mapping(manifest: dict[str, Any], boards: list[dict[str, Any]]) -> DeckMapping:
    suggestion = as_repeat(suggest_mapping(manifest, boards))
    suggestion.pop("notes", None)
    board_slide = manifest["slides"][1]
    chart = next((a for a in board_slide["areas"] if a["kind"] == "chart"), None)
    image = next((a for a in board_slide["areas"] if a["name"] == "Área gráfico riscos"), None)
    bindings = suggestion["slides"][str(board_slide["slide_id"])]["bindings"]
    if chart:
        bindings.append({"target": chart["id"], "mode": "chart", "field": "grafico.vazao"})
    if image:
        bindings.append({"target": image["id"], "mode": "chart", "field": "grafico.riscos"})
    return DeckMapping.model_validate(suggestion)


async def seed_demo(settings: Settings, sessions: sessionmaker[Session]) -> dict[str, Any]:
    demo = DemoJira(epic_plan=True)
    async with JiraClient(BASE_URL, "demo@cadencia.local", "token-demo", transport=demo.transport) as client:
        collector = Collector(client, sessions, settings)
        await collector.discover()
        with session_scope(sessions) as session:
            repo.set_selected_boards(session, list(demo.boards))
        result = await collector.collect(mode="full")

    # RF-45/RF-52: two projects, one variable name — the feature is only obvious with both filled
    # in, plus one value set on a single slide to show the narrowest scope winning.
    with session_scope(sessions) as session:
        aviso = repo.create_variable(
            session, name="aviso", label="Aviso de rodapé", description="Texto legal do rodapé."
        )
        repo.set_variable_value(
            session,
            aviso.id,
            scope="global",
            scope_key="",
            value="Documento interno — não distribuir fora da empresa.",
        )
        definicao = repo.create_variable(
            session,
            name="definicao",
            label="Definição do espaço",
            description="O que este time entrega, em uma frase.",
        )
        repo.set_variable_value(
            session,
            definicao.id,
            scope="space",
            scope_key="CAD",
            value=(
                "Produto Digital cuida da jornada de compra do e-commerce: checkout, meios de "
                "pagamento e o atendimento dos chamados que chegam dessa jornada."
            ),
        )
        repo.set_variable_value(
            session,
            definicao.id,
            scope="space",
            scope_key="DAD",
            value=(
                "Inteligência de Dados mantém a ingestão, o data warehouse corporativo e os "
                "indicadores que as áreas de negócio consultam todo dia."
            ),
        )

    with session_scope(sessions) as session:
        roles = {r.name: r.id for r in repo.list_roles(session)}
        for handle, entries in DEMO_TEAM.items():
            repo.save_member(
                session,
                PEOPLE[handle][0],
                active=True,
                roles=[(roles[name], seniority) for name, seniority in entries if name in roles],
            )

    path = build_sample_template(settings.data_dir / "modelo-exemplo.pptx")
    with session_scope(sessions) as session:
        template = store_template(
            session, settings, "modelo-exemplo.pptx", path.read_bytes(), "Modelo de exemplo"
        )
        boards = [{"id": b.id, "name": b.name} for b in repo.selected_boards(session)]
        mapping = demo_mapping(template.manifest, boards)
        repo.save_mapping(session, template.id, template.sha256, mapping.model_dump())
        template_id = template.id
    return {
        "collection": result["status"],
        "boards": [b["name"] for b in result["boards"]],
        "template_id": template_id,
        "anchor": demo.anchor.isoformat(),
    }
