"""Befunde der Barrierefreiheitsprüfung des Foliensatzes (#15)."""

from __future__ import annotations

from cadencia.i18n.fmt import number
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "no_alt_text": "Folie {slide}: „{shape}“ hat keinen Alternativtext.",
    "low_contrast": lambda slide, shape, ratio, minimum: (
        f"Folie {slide}: Text in „{shape}“ mit Kontrast {number(ratio, 'de-DE', 2)}:1 "
        f"(Minimum {number(minimum, 'de-DE', 2)}:1)."
    ),
    "title_order": "Folie {slide}: Der Titel steht in der Lesereihenfolge nicht an erster Stelle.",
}
