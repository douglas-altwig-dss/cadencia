"""Risikoeinstufung: Namen der Lagen, Beschreibung der Regeln und die Belege jeder Regel."""

from __future__ import annotations

from cadencia.i18n.fmt import day_month, number, plural
from cadencia.i18n.render import Entry


def _days(value: float) -> str:
    return f"{number(value, 'de-DE')} {plural(value, 'Tag', 'Tage')}"


MESSAGES: dict[str, Entry] = {
    "situation.em_dia": "Im Plan",
    "situation.envelhecendo": "Alternd",
    "situation.estagnado": "Stillstand",
    "situation.bloqueado": "Blockiert",
    "situation.atrasado": "Überfällig",
    "situation.arrastado": "Übertragen",
    "rule.arrasto": "War in abgeschlossenen Sprints, ohne erledigt zu werden.",
    "rule.prazo": "Fälligkeitsdatum (duedate) liegt vor dem Stichtag und der Vorgang ist nicht erledigt.",
    "rule.bloqueio": "Als Hindernis markiert, in einem blockierenden Status oder mit offenem Blocker.",
    "rule.estagnacao": (
        "In einer In-Arbeit-Spalte ohne Statuswechsel zwischen aufeinanderfolgenden Checkpoints."
    ),
    "rule.envelhecimento": "Zeit in Arbeit über dem historischen Perzentil desselben Typs und Boards.",
    "evidence.carried": lambda count, sprints: (
        f"durchlief {count} "
        f"{plural(count, 'abgeschlossenen Sprint', 'abgeschlossene Sprints')} ohne Abschluss "
        f"({', '.join(sprints)})"
    ),
    "evidence.overdue": lambda due, late: (
        f"Fälligkeitsdatum {day_month(due, 'de-DE')} seit {late} {plural(late, 'Tag', 'Tagen')} überschritten"
    ),
    "evidence.blocked": lambda reasons: "; ".join(reasons),
    "reason.flagged": "in Jira als Hindernis markiert",
    "reason.status": "im Status {status}",
    "reason.waiting": lambda keys: "wartet auf " + ", ".join(keys),
    "evidence.stalled": lambda days, column, checkpoints: (
        f"seit {days} {plural(days, 'Tag', 'Tagen')} unverändert in {column}"
        + (f" ({checkpoints} Checkpoints ohne Statuswechsel)" if checkpoints > 1 else "")
    ),
    "evidence.aging": lambda age, percentile, type_name, threshold: (
        f"seit {number(age, 'de-DE')} {plural(age, 'Tag', 'Tagen')} in Arbeit; historisches "
        f"P{number(percentile, 'de-DE')} für {type_name}: {_days(threshold)}"
    ),
    "detail.assignee": lambda before, after, when: (
        f"Bearbeiter wechselte am {day_month(when, 'de-DE')} von {before or 'niemandem'} zu "
        f"{after or 'niemandem'}, ohne Statuswechsel"
    ),
    "detail.estimate": lambda before, after, when: (
        f"Schätzung änderte sich am {day_month(when, 'de-DE')} von {before or '—'} auf {after or '—'}"
    ),
    "detail.sprint": lambda after, when: f"Sprint wechselte am {day_month(when, 'de-DE')} zu {after or '—'}",
}
