"""Epic-Plan: Probleme in den Jira-Daten, Planprüfung, Stunden- und Dauerangaben, Fehler der Seite
und der API. Tage werden mit „T“ abgekürzt, Stunden mit „h“ (z. B. „3T 1h“)."""

from __future__ import annotations

from cadencia.i18n.fmt import hours as _hours
from cadencia.i18n.fmt import listing as _listing
from cadencia.i18n.fmt import number, plural
from cadencia.i18n.render import Entry

_LOC = "de-DE"


def _h(value: float) -> str:
    return _hours(value, _LOC)


def _list(items: list[str], limit: int = 12) -> str:
    return _listing(items, limit, _LOC)


def _n(value: float) -> str:
    return number(value, _LOC, 2)


MESSAGES: dict[str, Entry] = {
    "seniority.junior": "Junior",
    "seniority.pleno": "Mid-Level",
    "seniority.senior": "Senior",
    "hours_source.original": "Ursprüngliche Schätzung",
    "hours_source.estimate": "Schätzungsfeld",
    "parameter.range": lambda name, low, high: (
        f"Der Parameter {name} muss zwischen {_n(low)} und {_n(high)} liegen."
    ),
    "parameter.workday_granularity": "Der Arbeitstag muss ein Vielfaches der Planungsgranularität sein.",
    "parameter.hours_source": "Ungültige Stundenquelle: {value}.",
    "parameter.empty": "Der Parameter {name} darf nicht leer sein.",
    "problem.code_review_without_code": "{task} ist als „ohne Code“ markiert, "
    "hat aber eine Code-Review-Unteraufgabe.",
    "problem.code_review_mismatch": lambda task, actual, expected, count, each: (
        f"Code-Review von {task}: {_h(actual)}h geschätzt, {_h(expected)}h erwartet "
        f"({count} {plural(count, 'Unteraufgabe', 'Unteraufgaben')} × {_h(each)}h)."
    ),
    "problem.card_setup_mismatch": lambda actual, expected, cards, minutes: (
        f"Anlegen der Karten: {_h(actual)}h geschätzt, {_h(expected)}h erwartet "
        f"({cards} {plural(cards, 'Karte', 'Karten')} × {_h(minutes)} min)."
    ),
    "hours_label": lambda hours, days, rest: (
        f"{_h(hours)}h" + ((f" · {days}T" + (f" {_h(rest)}h" if rest else "")) if days else "")
    ),
    "why.no_role_label": "kein Rollen-Label",
    "why.not_on_team": "{name} ist nicht im Team",
    "why.covers_roles": lambda name, count: f"{name} deckt {count} {plural(count, 'Rolle', 'Rollen')} ab",
    "why.no_role": "{name} hat keine Rolle",
    "why.no_assignee": "keine zuständige Person",
    "reason_group": lambda why, keys: f"{why}: {_list(keys, 8)}",
    "rounded_item": lambda key, before, after: f"{key} ({_h(before)}h → {_h(after)}h)",
    "problem.no_role": lambda count, reasons: (
        f"{count} {plural(count, 'Unteraufgabe', 'Unteraufgaben')} ohne Rolle ({'; '.join(reasons)}). "
        "Weisen Sie die Rolle unter „Rollen der Unteraufgaben“ zu, hinterlegen Sie die Rollen der "
        "zuständigen Personen im Team oder verwenden Sie Rollen-Labels in Jira."
    ),
    "problem.too_many_roles": lambda items: (
        f"Eine Unteraufgabe hat eine oder zwei Rollen; diese passen zu mehr: {_list(items, 6)}."
    ),
    "problem.no_hours": lambda count, total, source, keys: (
        f"{count} von {total} {plural(total, 'Unteraufgabe', 'Unteraufgaben')} ohne Stunden im "
        f"Jira-Feld „{source}“; sie zählen als 0h: {_list(keys)}."
    ),
    "problem.rounded": lambda step, items: (
        f"Stunden auf die Granularität von {_h(step)}h aufgerundet: {_list(items, 6)}."
    ),
    "problem.external_dependency": lambda items: (
        f"Abhängigkeiten von Vorgängen außerhalb des Epics wurden ignoriert: {_list(items, 8)}."
    ),
    "problem.empty_tasks": lambda count, keys: (
        f"{count} {plural(count, 'Aufgabe', 'Aufgaben')} ohne Unteraufgaben tragen keine Stunden bei: "
        f"{_list(keys)}."
    ),
    "problem.cycle": "Zirkuläre Abhängigkeit zwischen Unteraufgaben: {path}.",
    "problem.role_without_member": lambda role, keys: (
        f"Kein ausgewähltes Mitglied deckt die Rolle {role} ab; betroffene Unteraufgaben: {', '.join(keys)}."
    ),
    "problem.composite_without_pair": lambda keys: (
        "Zusammengesetzte Unteraufgaben brauchen zwei verschiedene Personen, und nur eine ausgewählte "
        f"Person deckt beide Rollen ab: {', '.join(keys)}."
    ),
    "problems": lambda items: " ".join(items),
    "violation.unknown_subtask": "{key} gehört nicht zum Epic.",
    "violation.roles_once": "{key} ist nicht genau einmal für jede benötigte Rolle eingeplant.",
    "violation.same_person": "{key} ist zusammengesetzt und hat dieselbe Person in beiden Plätzen.",
    "violation.not_together": "{key} ist zusammengesetzt und die beiden Plätze liegen nicht gleichzeitig.",
    "violation.not_selected": "{key} wurde {worker} zugeordnet, der nicht ausgewählt ist.",
    "violation.lacks_role": "{key} wurde {worker} zugeordnet, der die benötigte Rolle nicht hat.",
    "violation.duration": "{key} belegt seine Dauer nicht in zusammenhängenden Arbeitsstunden.",
    "violation.prerequisite": "{key} beginnt, bevor die Voraussetzung {prerequisite} abgeschlossen ist.",
    "violation.overlap": "{name} ist gleichzeitig in {first} und {second} eingeplant.",
    "violation.workday": "{name} überschreitet den Arbeitstag an Tag {day}.",
    "duration": lambda planning, execution, total: (
        f"Planung {planning} T + Umsetzung {execution} T = Gesamt {total} "
        f"{plural(total, 'Arbeitstag', 'Arbeitstage')}"
    ),
    "task_hours": lambda work, review: f"{_h(work)}h" + (f" + {_h(review)}h" if review else ""),
    "error.not_collected": "Das Epic {key} wurde nicht aus Jira abgerufen.",
    "error.unknown_parameter": "Unbekannter Parameter: {name}.",
    "error.hours_source": lambda value, options: (
        f"Ungültige Stundenquelle: {value}. Verwenden Sie {' oder '.join(options)}."
    ),
    "error.unknown_members": lambda ids: (
        f"Mitglieder, die nicht existieren, inaktiv sind oder keine Rolle haben: {', '.join(ids)}."
    ),
    "error.no_subtasks": "Das Epic {key} hat keine Unteraufgaben zum Planen.",
    "error.time_limit": "Das Zeitlimit muss zwischen {low} und {high} Sekunden liegen.",
    "error.unknown_selection": lambda ids: f"Unbekannte Mitglieder: {', '.join(ids)}.",
    "role_in_use.members": lambda names: f"zugewiesen an {', '.join(names)}",
    "role_in_use.subtasks": lambda keys: f"verwendet von den Unteraufgaben {_list(keys, 10)}",
    "role_in_use.message": lambda role, places: f"Die Rolle {role} wird verwendet: {'; '.join(places)}.",
}
