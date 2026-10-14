"""Die Fokus-Zeitleiste: Speicherkonflikte und Prüfung des Dokuments."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "conflict.cause": "die Zeitleiste hat sich geändert, während Sie bearbeitet haben",
    "conflict.action": "Laden Sie die Seite neu, um vor dem Speichern die aktuelle Version zu erhalten.",
    "duplicate": "Doppelter Eintrag ({what}): {value}.",
    "subject.member_id": "Mitglied (ID)",
    "subject.member": "Mitglied",
    "subject.theme": "Thema",
    "subject.signal": "Signal",
    "subject.entry_uid": "Eintrag (UID)",
    "task_needs_text": "Eine Aktivität braucht eine Beschreibung.",
    "switch_needs_themes": "Ein Fokuswechsel gibt an, welches Thema verlassen und zu welchem Thema "
    "gewechselt wird.",
}
