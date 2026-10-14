"""Datenabruf: was er speichert, wenn ein Board abbricht, und die Antworten der Einrichtungsrouten."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "no_board_selected": "kein Board ausgewählt",
    "cancelled.message": "Datenabruf auf Anfrage abgebrochen.",
    "cancelled.cause": "abgebrochen",
    "cancelled.action": "Starten Sie ihn erneut, wann Sie möchten; nichts wurde halb gespeichert.",
    "unexpected.cause": "unerwarteter Fehler",
    "unexpected.action": "Sehen Sie im strukturierten Log dieses Laufs nach.",
    "jira_not_configured.cause": "Jira nicht konfiguriert",
    "jira_not_configured.action": "Setzen Sie CADENCIA_JIRA_BASE_URL, CADENCIA_JIRA_EMAIL und "
    "CADENCIA_JIRA_API_TOKEN (Umgebungsvariable oder Datei in /run/secrets).",
    "no_space": "Kein Bereich",
    "board_not_found": "Board nicht gefunden",
    "board_unknown": "Das Board {board} existiert nicht oder wurde noch nicht erkannt.",
    "board_detail": "Board {board}.",
    "nothing_running": "kein Datenabruf läuft",
    "already_running.cause": "Datenabruf läuft",
    "already_running.action": "Warten Sie, bis der laufende Datenabruf beendet ist.",
}
