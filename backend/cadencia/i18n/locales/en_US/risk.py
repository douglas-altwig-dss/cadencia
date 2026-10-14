"""Risk classification: situation names, rule descriptions and the evidence each rule gives.

Messages describe facts, never judge people. Dates arrive as local ISO dates (the domain already
converted them to the board's time zone) and numbers raw.
"""

from __future__ import annotations

from cadencia.i18n.fmt import day_month, number, plural
from cadencia.i18n.render import Entry


def _days(value: float) -> str:
    return f"{number(value, 'en-US')} {plural(value, 'day', 'days')}"


MESSAGES: dict[str, Entry] = {
    # Situation names (Situation.label), one per Situation value.
    "situation.em_dia": "On track",
    "situation.envelhecendo": "Aging",
    "situation.estagnado": "Stalled",
    "situation.bloqueado": "Blocked",
    "situation.atrasado": "Overdue",
    "situation.arrastado": "Carried over",
    # What each rule means (Evidence.description), one per rule id.
    "rule.arrasto": "Was in closed sprints without being done.",
    "rule.prazo": "Due date (duedate) before the reference date and the item is not done.",
    "rule.bloqueio": "Flagged as an impediment, in a blocking status or with an open blocker.",
    "rule.estagnacao": "In an in-progress column with no status change between consecutive checkpoints.",
    "rule.envelhecimento": "Time in progress above the historical percentile for the same type and board.",
    # The evidence messages.
    "evidence.carried": lambda count, sprints: (
        f"went through {count} closed {plural(count, 'sprint', 'sprints')} without being done "
        f"({', '.join(sprints)})"
    ),
    "evidence.overdue": lambda due, late: (
        f"due date {day_month(due, 'en-US')} passed {late} {plural(late, 'day', 'days')} ago"
    ),
    # The blocked evidence is its reasons joined; each reason is one of the three below.
    "evidence.blocked": lambda reasons: "; ".join(reasons),
    "reason.flagged": "flagged as an impediment in Jira",
    "reason.status": "in status {status}",
    "reason.waiting": lambda keys: "waiting for " + ", ".join(keys),
    "evidence.stalled": lambda days, column, checkpoints: (
        f"stalled for {days} {plural(days, 'day', 'days')} in {column}"
        + (f" ({checkpoints} checkpoints without a status change)" if checkpoints > 1 else "")
    ),
    "evidence.aging": lambda age, percentile, type_name, threshold: (
        f"in progress for {_days(age)}; historical P{number(percentile, 'en-US')} for {type_name}: "
        f"{_days(threshold)}"
    ),
    # Details of a stalled item: what did move while the status did not.
    "detail.assignee": lambda before, after, when: (
        f"assignee changed from {before or 'nobody'} to {after or 'nobody'} on "
        f"{day_month(when, 'en-US')}, with no status change"
    ),
    "detail.estimate": lambda before, after, when: (
        f"estimate changed from {before or '—'} to {after or '—'} on {day_month(when, 'en-US')}"
    ),
    "detail.sprint": lambda after, when: f"sprint changed to {after or '—'} on {day_month(when, 'en-US')}",
}

SAMPLES = {
    "evidence.carried": {"count": 2, "sprints": ["Sprint 1", "Sprint 2"]},
    "evidence.overdue": {"due": "2026-09-08", "late": 3},
    "evidence.blocked": {"reasons": ["in status Blocked", "waiting for CAD-11"]},
    "reason.waiting": {"keys": ["CAD-11"]},
    "evidence.stalled": {"days": 10, "column": "Code Review", "checkpoints": 2},
    "evidence.aging": {"age": 7.5, "percentile": 85, "type_name": "Story", "threshold": 5.0},
    "detail.assignee": {"before": "Ana", "after": None, "when": "2026-09-08"},
    "detail.estimate": {"before": "3", "after": "5", "when": "2026-09-08"},
    "detail.sprint": {"after": "Sprint 2", "when": "2026-09-08"},
}
