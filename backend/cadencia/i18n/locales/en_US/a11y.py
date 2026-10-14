"""Findings of the deck's accessibility check (#15, report/core/a11y.py)."""

from __future__ import annotations

from cadencia.i18n.fmt import number
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "no_alt_text": "Slide {slide}: “{shape}” has no alt text.",
    "low_contrast": lambda slide, shape, ratio, minimum: (
        f"Slide {slide}: text in “{shape}” has a contrast of {number(ratio, 'en-US', 2)}:1 "
        f"(minimum {number(minimum, 'en-US', 2)}:1)."
    ),
    "title_order": "Slide {slide}: the title is not first in reading order.",
}

SAMPLES = {"low_contrast": {"slide": 2, "shape": "Title 1", "ratio": 2.85, "minimum": 4.5}}
