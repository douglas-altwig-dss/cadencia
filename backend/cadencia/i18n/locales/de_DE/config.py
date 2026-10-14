"""In der App gespeicherte Einstellungen (docs/config-store.md): Ablehnungen und Verbindungstest."""

from __future__ import annotations

from cadencia.i18n.render import Entry


def _missing(fields: list[str]) -> str:
    return "Vor dem Test ausfüllen: " + ", ".join(fields) + "."


MESSAGES: dict[str, Entry] = {
    "error.unknown": "{key} ist keine Einstellung.",
    "error.bootstrap": (
        "{key} kann nur in der Umgebung gesetzt werden: Sie wird gebraucht, bevor die Datenbank "
        "erreichbar ist."
    ),
    "error.int": "{key} muss eine ganze Zahl von {min} bis {max} sein.",
    "error.float": "{key} muss eine Zahl von {min} bis {max} sein.",
    "error.weekday": "{key} muss ein Wochentag von 0 (Montag) bis 6 (Sonntag) sein.",
    "error.hour": "{key} muss eine Stunde von 0 bis 23 sein.",
    "error.bool": "{key} muss wahr oder falsch sein.",
    "error.string": "{key} muss ein Text sein.",
    "error.url": "{key} muss eine http- oder https-Adresse sein, etwa https://firma.atlassian.net.",
    "error.email": "{key} muss eine E-Mail-Adresse sein.",
    "error.timezone": "{value} ist keine bekannte Zeitzone; verwenden Sie einen Namen wie Europe/Berlin.",
    "error.locale": "{value} ist keine unterstützte Sprache; verwenden Sie eine davon: {supported}.",
    "error.refused": "{key} hat einen Wert, der nicht verwendet werden kann.",
    "field.jira_base_url": "Jira-Adresse",
    "field.jira_email": "E-Mail",
    "field.jira_api_token": "API-Token",
    "jira_test.missing.cause": "Jira-Verbindung unvollständig",
    "jira_test.missing.message": _missing,
    "jira_test.missing.action": (
        "Geben Sie die Jira-Adresse, die E-Mail und das API-Token ein und testen Sie erneut."
    ),
    "jira_test.invalid.cause": "Jira-Verbindungsdaten abgelehnt",
    "jira_test.invalid.action": "Korrigieren Sie den Wert und testen Sie erneut.",
}
