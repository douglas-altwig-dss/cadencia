"""Benachrichtigungen: Ereignisse, an Kanäle gesendete Nachrichten und Zustellfehler."""

from __future__ import annotations

from cadencia.i18n.fmt import day_month_year
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "event.deck": "Foliensatz erstellt",
    "event.digest": "Risikoübersicht",
    "event.collection_failed": "Datenabruf fehlgeschlagen",
    "channel.bad_email": "ungültige E-Mail-Adresse: {addresses}",
    "channel.bad_url": "das Ziel eines Webhooks muss eine HTTP- oder HTTPS-URL sein",
    "channel.not_found": "Der Kanal {id} existiert nicht.",
    "open_in_app": "In Cadência öffnen",  # i18n: out of scope (product name)
    "error.smtp_missing": (
        "SMTP nicht konfiguriert: Mailserver unter Einstellungen → E-Mail & Links eintragen"
    ),
    "error.http": "HTTP {status}: {body}",
    "deck.title": "Foliensatz erstellt: {name}",
    "deck.approved": "Validierung bestanden und bereit zum Herunterladen.",
    "deck.refused": "Validierung nicht bestanden ({errors} Fehler); öffnen Sie ihn, um zu sehen, was fehlt.",
    "deck.field.reference": "Referenz",
    "deck.field.slides": "Folien",
    "deck.field.warnings": "Warnungen",
    "deck.reference_at": lambda at: f"{day_month_year(at, 'de-DE', time=True)} UTC",
    "digest.title": "Neue Risiken — {space}: {count}",
    "collection.failed": "Datenabruf fehlgeschlagen",
    "collection.partial": "Datenabruf teilweise fehlgeschlagen",
    "collection.failed_text": "Der geplante Datenabruf ist fehlgeschlagen.",
    "test.title": "Test von Cadência",  # i18n: out of scope (product name)
    "test.text": "Wenn Sie dies lesen, ist der Kanal richtig eingerichtet.",
}
