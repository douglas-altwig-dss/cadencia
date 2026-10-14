"""Papéis com que uma instalação nova começa (gravados uma vez; depois são dados da equipe)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "role.architect.name": "Arquiteto de Software",
    "role.architect.description": "Desenha a solução técnica antes do desenvolvimento e define os "
    "contratos entre backend, frontend e dados.",
    "role.backend.name": "Backend",
    "role.backend.description": "Constrói e mantém as APIs, a lógica de negócio e as integrações com "
    "bancos de dados e serviços externos.",
    "role.data.name": "Cientista de Dados / Engenheiro de Dados",
    "role.data.description": "Modela, treina e avalia os agentes de IA e constrói os pipelines de "
    "dados que os sustentam.",
    "role.frontend.name": "Frontend",
    "role.frontend.description": "Constrói a interface que o usuário final utiliza, consumindo as "
    "APIs entregues pelo backend.",
    "role.infrastructure.name": "Infraestrutura",
    "role.infrastructure.description": "Provisiona e mantém filas, observabilidade e ambientes.",
    "role.pm_po.name": "PM/PO",
    "role.pm_po.description": "Gerencia prazo, escopo e comunicação com o cliente; prioriza o "
    "backlog e traduz necessidades em requisitos.",
    "role.tech_lead.name": "Tech Leader",
    "role.tech_lead.description": "Guia as decisões técnicas do time, garante a qualidade do código "
    "e destrava impedimentos técnicos.",
}
