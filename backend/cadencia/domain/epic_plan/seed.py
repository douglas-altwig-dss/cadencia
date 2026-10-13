"""Roles a fresh install starts with. Seeded once; after that the CRUD owns them (deleting all of
them does not bring them back)."""

from __future__ import annotations

ROLE_SEED: tuple[dict[str, object], ...] = (
    {
        "name": "Arquiteto de Software",
        "description": "Desenha a solução técnica antes do desenvolvimento e define os contratos entre "
        "backend, frontend e dados.",
        "color": "#4dabf7",
        "labels": ["arquitetura", "arquiteto"],
    },
    {
        "name": "Backend",
        "description": "Constrói e mantém as APIs, a lógica de negócio e as integrações com bancos de "
        "dados e serviços externos.",
        "color": "#20c997",
        "labels": ["backend"],
    },
    {
        "name": "Cientista de Dados / Engenheiro de Dados",
        "description": "Modela, treina e avalia os agentes de IA e constrói os pipelines de dados que "
        "os sustentam.",
        "color": "#f783ac",
        "labels": ["dados", "ciencia-de-dados", "engenharia-de-dados"],
    },
    {
        "name": "Frontend",
        "description": "Constrói a interface que o usuário final utiliza, consumindo as APIs entregues "
        "pelo backend.",
        "color": "#b197fc",
        "labels": ["frontend"],
    },
    {
        "name": "Infraestrutura",
        "description": "Provisiona e mantém filas, observabilidade e ambientes.",
        "color": "#8ca0b3",
        "labels": ["infra", "infraestrutura"],
    },
    {
        "name": "PM/PO",
        "description": "Gerencia prazo, escopo e comunicação com o cliente; prioriza o backlog e traduz "
        "necessidades em requisitos.",
        "color": "#fcc419",
        "labels": ["pm", "po", "pm-po"],
    },
    {
        "name": "Tech Leader",
        "description": "Guia as decisões técnicas do time, garante a qualidade do código e destrava "
        "impedimentos técnicos.",
        "color": "#69db7c",
        "labels": ["tech-lead", "tech-leader"],
    },
)
