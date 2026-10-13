"""Allgemeine Texte: Fehlerursachen, 401/404/400/500-Antworten der API, Listenenden."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "not_found": "{subject} nicht gefunden.",
    "error.not_found": "nicht gefunden",
    "error.invalid": "ungültige Anfrage",
    "error.internal.cause": "interner Fehler",
    "error.internal.message": "{error} bei {path}",
    "error.internal.action": "Den vollständigen Traceback finden Sie im API-Log.",
    "auth.cause": "fehlende oder ungültige Anmeldedaten",
    "auth.message": "Die API erfordert das in CADENCIA_API_TOKEN festgelegte Token.",
    "auth.action": "Verwenden Sie die Weboberfläche (Anmeldung mit Benutzername und Passwort) oder "
    "senden Sie Authorization: Bearer <token>.",
    "listing.more": "{shown} und {more} weitere",
}
