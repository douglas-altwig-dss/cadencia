"""Prüfung der Board-Einstellungen (BoardProfile.check, RF-05)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "invalid": lambda problems: "; ".join(problems),
    "problem": "{key}: {problem}",
    "integer": "muss eine ganze Zahl sein",
    "number": "muss eine Zahl sein",
    "between": "muss zwischen {low} und {high} liegen",
    "timezone": "unbekannte Zeitzone: {value}",
    "names": "muss eine Liste von Texten sein",
    "dates": "muss eine Liste von Daten im Format JJJJ-MM-TT sein",
    "date": "ungültiges Datum: {value} (verwenden Sie JJJJ-MM-TT)",
    "affinity": "muss jeder Person eine Liste von Texten zuordnen",
}
