"""The roles a fresh install starts with (written once, in CADENCIA_LOCALE; the team's data after)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "role.architect.name": "Software Architect",
    "role.architect.description": "Designs the technical solution before development and defines "
    "the contracts between backend, frontend and data.",
    "role.backend.name": "Backend",
    "role.backend.description": "Builds and maintains the APIs, the business logic and the "
    "integrations with databases and external services.",
    "role.data.name": "Data Scientist / Data Engineer",
    "role.data.description": "Models, trains and evaluates the AI agents and builds the data "
    "pipelines behind them.",
    "role.frontend.name": "Frontend",
    "role.frontend.description": "Builds the interface the end user works with, consuming the APIs "
    "the backend delivers.",
    "role.infrastructure.name": "Infrastructure",
    "role.infrastructure.description": "Provisions and maintains queues, observability and environments.",
    "role.pm_po.name": "PM/PO",
    "role.pm_po.description": "Manages deadlines, scope and communication with the client; "
    "prioritises the backlog and turns needs into requirements.",
    "role.tech_lead.name": "Tech Leader",
    "role.tech_lead.description": "Guides the team's technical decisions, ensures code quality and "
    "removes technical impediments.",
}
