"""Warum der KI-Entwurf des Begleittexts (report/narrative.py) nicht geschrieben werden konnte. Der
Prompt steht nicht hier: Er verlangt die Sprache des Foliensatzes und bleibt, wie er ist."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "disabled": "KI-Vorschläge sind ausgeschaltet (CADENCIA_AI_ENABLED).",
    "package_missing": "Das Paket anthropic ist im Backend nicht installiert.",
    "key_refused": "Der Anthropic-API-Schlüssel wurde abgelehnt.",
    "rate_limited": "Nutzungslimit der API erreicht; versuchen Sie es gleich noch einmal.",
    "status_error": "Die API hat mit Fehler {status} geantwortet.",
    "unreachable": "Die Anthropic-API ist nicht erreichbar.",
    "refused": "Die KI hat abgelehnt, diesen Text zu schreiben; schreiben Sie ihn von Hand.",
    "empty": "Die KI hat keinen Text geliefert.",
}
