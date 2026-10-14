"""O que mudou entre dois checkpoints (RF-74) e o resumo de riscos (RF-73). Textos de antes (R8)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "checkpoint.not_found": "O checkpoint {checkpoint} não existe neste board ou não tem snapshot.",
    "checkpoint.order": "O checkpoint final precisa ser posterior ao inicial.",
    "digest.since_start": "o início",
    "digest.nothing_new": "{board}: nada novo desde {since}.",
    "digest.summary": "{board}: {risks} novo(s) risco(s), {resolved} resolvido(s) desde {since}.",
}
