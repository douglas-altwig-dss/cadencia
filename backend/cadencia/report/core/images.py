"""Pictures the module renders for itself (RF-63).

A variable can carry a value that belongs on a slide as an *image* rather than as words: a link to
scan, an id to hand to a phone. `charts.py` already renders a series; this renders a value.

Nothing here reaches the network. A QR code is computed from the string it encodes, so a deck
built offline is the same deck built online — which is the whole reason this is a rendered picture
and not a fetched one.
"""

from __future__ import annotations

from pathlib import Path

import segno

#: Error correction. "M" recovers about 15% of a damaged symbol, which survives being printed,
#: projected and photographed off a screen — the three things a deck's QR actually goes through.
DEFAULT_ERROR = "m"


def render_qr_png(
    value: str,
    path: Path,
    *,
    size_px: int = 600,
    dark: str = "#000000",
    light: str = "#FFFFFF",
    error: str = DEFAULT_ERROR,
) -> Path:
    """Write ``value`` as a QR code PNG, square, sized to fit ``size_px``.

    ``scale`` is derived rather than fixed: segno picks the smallest version that holds the string,
    so a short link and a long one would otherwise come out at wildly different pixel sizes and be
    scaled again by PowerPoint. Computing it from the symbol's own width keeps every QR in a deck
    the same size on the slide and sharp at that size.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    code = segno.make(value, error=error)
    modules = code.symbol_size(scale=1, border=4)[0]  # width in modules, including the quiet zone
    scale = max(1, round(size_px / max(modules, 1)))
    code.save(str(path), kind="png", scale=scale, border=4, dark=dark, light=light)
    return path
