"""Rollen, mit denen eine neue Installation beginnt (einmal angelegt; danach Daten des Teams)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "role.architect.name": "Softwarearchitekt",
    "role.architect.description": "Entwirft die technische Lösung vor der Entwicklung und legt die "
    "Schnittstellen zwischen Backend, Frontend und Daten fest.",
    "role.backend.name": "Backend",
    "role.backend.description": "Entwickelt und pflegt die APIs, die Geschäftslogik und die "
    "Anbindungen an Datenbanken und externe Dienste.",
    "role.data.name": "Data Scientist / Data Engineer",
    "role.data.description": "Modelliert, trainiert und bewertet die KI-Agenten und baut die "
    "Datenpipelines, auf denen sie beruhen.",
    "role.frontend.name": "Frontend",
    "role.frontend.description": "Entwickelt die Oberfläche für die Endnutzer und nutzt dafür die "
    "APIs des Backends.",
    "role.infrastructure.name": "Infrastruktur",
    "role.infrastructure.description": "Stellt Warteschlangen, Observability und Umgebungen bereit "
    "und pflegt sie.",
    "role.pm_po.name": "PM/PO",
    "role.pm_po.description": "Verantwortet Termine, Umfang und Kommunikation mit dem Kunden; "
    "priorisiert das Backlog und übersetzt Bedürfnisse in Anforderungen.",
    "role.tech_lead.name": "Tech Lead",
    "role.tech_lead.description": "Leitet die technischen Entscheidungen des Teams, sichert die "
    "Codequalität und beseitigt technische Hindernisse.",
}
