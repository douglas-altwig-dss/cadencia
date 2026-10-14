"""Jira-Fehler: Ursache und Maßnahme je Art sowie die Meldungen des HTTP-Clients."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "error.cause": "unerwarteter Fehler bei der Kommunikation mit Jira",
    "error.action": "Versuchen Sie es erneut; wenn es weiterhin auftritt, sehen Sie im Log des "
    "Datenabrufs nach.",
    "auth.cause": "ungültige Anmeldedaten",
    "auth.action": "Prüfen Sie die E-Mail-Adresse und erstellen Sie unter id.atlassian.com ein neues "
    "API-Token.",  # i18n: out of scope (domain name)
    "permission.cause": "keine Berechtigung",
    "permission.action": "Beantragen Sie für das von Cadência verwendete Konto Lesezugriff auf das "
    "Projekt oder Board.",  # i18n: out of scope (product name)
    "not_found.cause": "Ressource nicht gefunden",
    "not_found.action": "Prüfen Sie, ob das Board, der Sprint oder der Vorgang noch existiert und ob "
    "das Konto Zugriff hat.",
    "host.cause": "Host nicht erreichbar oder falsch",
    "host.action": "Prüfen Sie die URL der Instanz, zum Beispiel https://firma.atlassian.net.",
    "query.cause": "ungültige JQL-Abfrage",
    "query.action": "Überprüfen Sie die JQL; der Endpunkt /search/jql validiert die Abfrage nicht selbst.",
    "rate_limit.cause": "Anfragelimit von Jira erreicht",
    "rate_limit.action": "Warten Sie einige Minuten oder verringern Sie CADENCIA_JIRA_MAX_CONCURRENCY.",
    "server.cause": "interner Fehler in Jira",
    "server.action": "Jira hat mit einem Fehler geantwortet; versuchen Sie es in einigen Minuten erneut.",
    "write_forbidden.cause": "Schreibvorgang blockiert",
    "write_forbidden.action": (
        "Cadência ist schreibgeschützt; "  # i18n: out of scope (product name)
        "Schreibaufrufe sind nicht erlaubt."
    ),
    "message.no_base_url": "URL der Jira-Instanz nicht konfiguriert",
    "message.no_credentials": "E-Mail-Adresse oder API-Token fehlt",
    "message.write_blocked": (
        "{method} {path} blockiert: Cadência ist schreibgeschützt"  # i18n: out of scope (product name)
    ),
    "message.timeout": "Zeitüberschreitung beim Aufruf von {path}",
    "message.connect": "Keine Verbindung zu {url} möglich ({error})",
    "message.not_json": "Antwort ohne JSON bei {path}: Die Adresse scheint kein Jira zu sein",
    "message.redirect": "{path} wurde nach {location} umgeleitet",
    "message.rate_limited": "HTTP 429 bei {path}",
    "message.http": "HTTP {status} bei {path}: {detail}",
    "message.auth": "Jira hat die Anmeldedaten abgelehnt (HTTP 401): {detail}",
    "message.permission": "Keine Berechtigung für {path} (HTTP 403): {detail}",
    "message.not_found": "{path} nicht gefunden (HTTP 404): {detail}",
    "message.query": "JQL abgelehnt: {detail}",
}
