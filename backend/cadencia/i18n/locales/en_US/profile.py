"""Board profile settings validation (BoardProfile.check, RF-05)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    # The whole refusal: every problem, "setting: problem", joined.
    "invalid": lambda problems: "; ".join(problems),
    "problem": "{key}: {problem}",
    "integer": "must be a whole number",
    "number": "must be a number",
    "between": "must be between {low} and {high}",
    "timezone": "unknown time zone: {value}",
    "names": "must be a list of texts",
    "dates": "must be a list of YYYY-MM-DD dates",
    "date": "invalid date: {value} (use YYYY-MM-DD)",
    "affinity": "must map each person to a list of texts",
}

SAMPLES = {
    "invalid": {"problems": ["timezone: unknown time zone: 'Mars/Base'"]},
    "problem": {"key": "timezone", "problem": "unknown time zone: 'Mars/Base'"},
    "timezone": {"value": "'Mars/Base'"},
    "date": {"value": "'2026-13-01'"},
}
