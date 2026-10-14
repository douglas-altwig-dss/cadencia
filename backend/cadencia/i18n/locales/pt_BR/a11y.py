"""Achados da verificação de acessibilidade do deck (#15)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "no_alt_text": "Slide {slide}: “{shape}” não tem texto alternativo.",
    "low_contrast": lambda slide, shape, ratio, minimum: (
        f"Slide {slide}: texto em “{shape}” com contraste {ratio:g}:1 (mínimo {minimum:g}:1)."
    ),
    "title_order": "Slide {slide}: o título não é o primeiro na ordem de leitura.",
}
