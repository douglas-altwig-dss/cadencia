"""Planungsalgorithmen: Namen, Beschreibungen und Fehler."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "strategy.guloso.name": "List Scheduling (Greedy-Heuristik)",
    "strategy.guloso.description": "Schnell, antwortet in Sekunden. Weist jede Unteraufgabe der passenden "
    "Fachperson zu, die zuerst frei ist, und beachtet dabei die Voraussetzungen. Garantiert nicht die beste "
    "Lösung, eignet sich aber ideal für schnelle Simulationen.",
    "strategy.milp.name": "Exaktes MS-RCPSP (MILP)",
    "strategy.milp.description": "Modelliert die Planung mit mehreren Qualifikationen und begrenzten "
    "Ressourcen als gemischt-ganzzahlige lineare Optimierung. Kann die optimale Lösung beweisen, aber die "
    "Laufzeit wächst stark mit der Zahl der Unteraufgaben; daher läuft sie mit Zeitlimit.",
    "strategy.cpsat.name": "Constraint Programming (CP-SAT)",
    "strategy.cpsat.description": "Verwendet den Constraint-Solver von Google OR-Tools. Kommt gut mit "
    "Vorgängerbeziehungen, Überschneidungsfreiheit und Verfügbarkeit zurecht und findet meist schnell sehr "
    "gute Lösungen. Empfohlene Option.",
    "unknown": lambda algorithm, options: (
        f"Unbekannter Algorithmus: {algorithm}. Optionen: {', '.join(options)}."
    ),
    "unavailable": "OR-Tools ({solver}) ist im Backend nicht installiert.",
    "unavailable_cause": "Solver nicht verfügbar",
    "unavailable_action": "Installieren Sie die Backend-Abhängigkeiten (ortools) oder verwenden Sie den "
    "Greedy-Algorithmus.",
}
