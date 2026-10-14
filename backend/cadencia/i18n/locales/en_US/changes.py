"""What changed between two checkpoints (RF-74) and the risk digest built on it (RF-73)."""

from __future__ import annotations

from cadencia.i18n.fmt import plural
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "checkpoint.not_found": "Checkpoint {checkpoint} does not exist on this board or has no snapshot.",
    "checkpoint.order": "The final checkpoint must come after the initial one.",
    # The digest's text, one line per board; `since` is a formatted moment or `digest.since_start`.
    "digest.since_start": "the start",
    "digest.nothing_new": "{board}: nothing new since {since}.",
    "digest.summary": lambda board, risks, resolved, since: (
        f"{board}: {risks} new {plural(risks, 'risk', 'risks')}, {resolved} resolved since {since}."
    ),
}

SAMPLES = {
    "digest.summary": {"board": "Plataforma", "risks": 2, "resolved": 1, "since": "09/08 15:00"},
}
