"""Fonts the browser can load so its text metrics match PowerPoint's (RF-47).

A canvas that measures text in whatever font the machine happens to have will wrap lines in places
PowerPoint does not, and the editor's promise — what you see is where it lands — dies there.

The fix is metric compatibility. Carlito has the same advance widths as Calibri, Liberation Sans as
Arial, Liberation Serif as Times New Roman, Liberation Mono as Courier New: substituting one for the
other moves no glyph. The server ships whichever of these it has to the browser as a web font, under
the *original* family name, so a text box that says "Calibri 18pt" is laid out with Calibri's own
metrics even on a machine that has never had Calibri installed.

Where no compatible face is available the family is reported as approximate, and the editor says so
rather than pretending.
"""

from __future__ import annotations

from pathlib import Path

#: Family in the deck -> the metric-compatible face to serve for it, best first.
SUBSTITUTES: dict[str, tuple[str, ...]] = {
    "calibri": ("Carlito",),
    "carlito": ("Carlito",),
    "cambria": ("Caladea",),
    "arial": ("LiberationSans",),
    "helvetica": ("LiberationSans",),
    "liberation sans": ("LiberationSans",),
    "times new roman": ("LiberationSerif",),
    "georgia": ("LiberationSerif",),
    "courier new": ("LiberationMono",),
    "consolas": ("LiberationMono",),
}
#: Faces we know how to find, and the file stems each one uses per weight/style.
FACES: dict[str, dict[str, tuple[str, ...]]] = {
    "Carlito": {
        "400": ("Carlito-Regular",),
        "700": ("Carlito-Bold",),
        "400i": ("Carlito-Italic",),
        "700i": ("Carlito-BoldItalic",),
    },
    "Caladea": {
        "400": ("Caladea-Regular",),
        "700": ("Caladea-Bold",),
        "400i": ("Caladea-Italic",),
        "700i": ("Caladea-BoldItalic",),
    },
    "LiberationSans": {
        "400": ("LiberationSans-Regular",),
        "700": ("LiberationSans-Bold",),
        "400i": ("LiberationSans-Italic",),
        "700i": ("LiberationSans-BoldItalic",),
    },
    "LiberationSerif": {
        "400": ("LiberationSerif-Regular",),
        "700": ("LiberationSerif-Bold",),
        "400i": ("LiberationSerif-Italic",),
        "700i": ("LiberationSerif-BoldItalic",),
    },
    "LiberationMono": {
        "400": ("LiberationMono-Regular",),
        "700": ("LiberationMono-Bold",),
        "400i": ("LiberationMono-Italic",),
        "700i": ("LiberationMono-BoldItalic",),
    },
}
SEARCH_DIRS = (
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    "/Library/Fonts",
    "/System/Library/Fonts",
)


def _index() -> dict[str, Path]:
    """Every .ttf/.otf the machine has, by file stem. Built once per process."""
    global _CACHE
    if _CACHE is None:
        found: dict[str, Path] = {}
        for root in SEARCH_DIRS:
            base = Path(root)
            if not base.is_dir():
                continue
            for path in base.rglob("*"):
                if path.suffix.lower() in {".ttf", ".otf"} and path.is_file():
                    found.setdefault(path.stem, path)
        _CACHE = found
    return _CACHE


_CACHE: dict[str, Path] | None = None


def face_file(face: str, variant: str) -> Path | None:
    for stem in FACES.get(face, {}).get(variant, ()):
        path = _index().get(stem)
        if path is not None:
            return path
    return None


def available_faces() -> dict[str, list[str]]:
    """Which faces this machine can actually serve, and in which variants."""
    out: dict[str, list[str]] = {}
    for face, variants in FACES.items():
        have = [variant for variant in variants if face_file(face, variant) is not None]
        if have:
            out[face] = have
    return out


def font_plan(families: list[str]) -> dict[str, object]:
    """For each family the deck uses, the face to load and whether the metrics really match."""
    faces = available_faces()
    plan = []
    for family in sorted({f for f in families if f}):
        candidates = SUBSTITUTES.get(family.strip().lower(), ())
        face = next((c for c in candidates if c in faces), None)
        plan.append(
            {
                "family": family,
                "face": face,
                "variants": faces.get(face or "", []),
                # Only a documented metric-compatible substitute earns this.
                "metric_compatible": face is not None,
            }
        )
    return {"families": plan, "faces": sorted(faces)}
