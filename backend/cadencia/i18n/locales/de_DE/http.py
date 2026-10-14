"""Allgemeine Anfragefehler der gemeinsamen API-Abhängigkeiten (api/deps.py)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "invalid_name.cause": "ungültiger Name",
    "file_not_found.cause": "Datei nicht gefunden",
    "board_not_found.cause": "Board nicht gefunden",
    "board_not_found.message": "Das Board {board_id} existiert nicht oder wurde noch nicht erkannt.",
    "sprint_not_found.cause": "Sprint nicht gefunden",
    "sprint_not_found.message": "Der Sprint {sprint_id} wurde nicht abgerufen.",
    "issue_not_found.cause": "Vorgang nicht gefunden",
    "issue_not_found.message": "Der Vorgang {key} wurde auf keinem Board abgerufen.",
    "invalid_date.cause": "ungültiges Datum",
    "invalid_date.message": "{value} ist kein ISO-Datum.",
    "invalid_param.cause": "ungültiger Parameter",
}
