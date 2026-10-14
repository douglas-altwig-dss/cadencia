"""Was sich zwischen zwei Checkpoints geändert hat (RF-74), und die Risikozusammenfassung (RF-73)."""

from __future__ import annotations

from cadencia.i18n.fmt import plural
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "checkpoint.not_found": (
        "Der Checkpoint {checkpoint} existiert auf diesem Board nicht oder hat keinen Snapshot."
    ),
    "checkpoint.order": "Der End-Checkpoint muss nach dem Start-Checkpoint liegen.",
    "digest.since_start": "Beginn",
    "digest.nothing_new": "{board}: nichts Neues seit {since}.",
    "digest.summary": lambda board, risks, resolved, since: (
        f"{board}: {risks} {plural(risks, 'neues Risiko', 'neue Risiken')}, {resolved} gelöst seit {since}."
    ),
}
