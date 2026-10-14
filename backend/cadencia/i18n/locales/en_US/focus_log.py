"""The focus log ("Timeline de foco"): save conflicts and document validation."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "conflict.cause": "the timeline changed while you were editing",
    "conflict.action": "Reload the page to get the current version before saving.",
    # `what` is one of the `subject.*` entries below, already rendered.
    "duplicate": "Duplicate {what}: {value}.",
    "subject.member_id": "member (id)",
    "subject.member": "member",
    "subject.theme": "theme",
    "subject.signal": "signal",
    "subject.entry_uid": "entry (uid)",
    "task_needs_text": "An activity needs a description.",
    "switch_needs_themes": "A focus switch says which theme it leaves and which theme it goes to.",
}
