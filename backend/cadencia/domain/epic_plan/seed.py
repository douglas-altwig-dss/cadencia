"""Roles a fresh install starts with. Seeded once; after that the CRUD owns them (deleting all of
them does not bring them back).

Names and descriptions are messages (``seed.role.<key>.name`` / ``.description``): the store renders
them once, in ``CADENCIA_LOCALE``, when it seeds an empty table. From then on they are the team's
own data and are never translated again (docs/i18n-backend.md, decision 4).
"""

from __future__ import annotations

from cadencia.i18n.message import Msg

ROLE_SEED: tuple[dict[str, object], ...] = (
    {
        "key": "architect",
        "name": Msg("seed.role.architect.name"),
        "description": Msg("seed.role.architect.description"),
        "color": "#4dabf7",
        "labels": ["arquitetura", "arquiteto"],
    },
    {
        "key": "backend",
        "name": Msg("seed.role.backend.name"),
        "description": Msg("seed.role.backend.description"),
        "color": "#20c997",
        "labels": ["backend"],
    },
    {
        "key": "data",
        "name": Msg("seed.role.data.name"),
        "description": Msg("seed.role.data.description"),
        "color": "#f783ac",
        "labels": ["dados", "ciencia-de-dados", "engenharia-de-dados"],
    },
    {
        "key": "frontend",
        "name": Msg("seed.role.frontend.name"),
        "description": Msg("seed.role.frontend.description"),
        "color": "#b197fc",
        "labels": ["frontend"],
    },
    {
        "key": "infrastructure",
        "name": Msg("seed.role.infrastructure.name"),
        "description": Msg("seed.role.infrastructure.description"),
        "color": "#8ca0b3",
        "labels": ["infra", "infraestrutura"],
    },
    {
        "key": "pm_po",
        "name": Msg("seed.role.pm_po.name"),
        "description": Msg("seed.role.pm_po.description"),
        "color": "#fcc419",
        "labels": ["pm", "po", "pm-po"],
    },
    {
        "key": "tech_lead",
        "name": Msg("seed.role.tech_lead.name"),
        "description": Msg("seed.role.tech_lead.description"),
        "color": "#69db7c",
        "labels": ["tech-lead", "tech-leader"],
    },
)
