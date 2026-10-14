"""Ablehnungen des Repositorys: Boards, Variablen, Abwesenheiten, Ansichten, Kommentare, Rollen, Team."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "board.not_found": "Board {board}.",
    "board.unknown_settings": "unbekannte Felder: {fields}",
    "variable.bad_name": "ungültiger Name: {name}",
    "variable.duplicate": "in diesem Geltungsbereich gibt es bereits eine Variable namens {name}",
    "variable.bad_scope": "ungültiger Geltungsbereich: {scope}",
    "variable.not_found": "Die Variable {id} existiert nicht.",
    "variable.scope_needs_target": "der Geltungsbereich {scope} braucht ein Ziel",
    "absence.end_before_start": "das Ende der Abwesenheit liegt vor ihrem Beginn",
    "availability.hours": "Die Stunden pro Tag liegen zwischen 0,5 und 24.",
    "availability.allocation": "Der Anteil liegt zwischen 0 % und 100 %.",
    "view.name_missing": "Geben Sie der Ansicht einen Namen",
    "view.bad_path": (
        "eine Ansicht muss auf eine Seite von Cadência verweisen "  # i18n: out of scope (product name)
        "(ein Pfad, der mit / beginnt)"
    ),
    "view.not_found": "Die Ansicht {id} existiert nicht.",
    "comment.empty": "der Kommentar ist leer",
    "comment.not_in_template": "Der Kommentar {id} existiert in dieser Vorlage nicht.",
    "comment.not_found": "Der Kommentar {id} existiert nicht.",
    "role.name_missing": "Die Rolle braucht einen Namen.",
    "role.bad_color": "Die Farbe der Rolle muss im Format #rrggbb angegeben werden.",
    "role.duplicate": "Es gibt bereits eine Rolle namens {name}.",
    "role.not_found": "Rolle nicht gefunden.",
    "role.in_use": "Die Rolle {role} ist folgenden Personen zugewiesen: {people}. Entfernen Sie sie "
    "zuerst bei diesen Personen.",
    "role.missing": "Die Rolle {id} existiert nicht.",
    "person.not_found": "Person nicht unter den aus Jira abgerufenen Personen gefunden.",
    "member.bad_seniority": "Ungültige Seniorität: {seniority}. Verwenden Sie {allowed}.",
    "member.role_twice": "Eine Rolle kommt bei derselben Person zweimal vor.",
    "subtask.not_found": "{key} ist keine abgerufene Unteraufgabe.",
    "subtask.role_count": "Eine Unteraufgabe hat eine oder zwei Rollen.",
    "subtask.unknown_roles": "Unbekannte Rolle: {ids}.",
}
