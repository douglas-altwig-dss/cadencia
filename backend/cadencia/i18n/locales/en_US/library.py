"""The Apresentação library (report/library.py): blocks, images, slide history, template
diagnostics and usage hints."""

from __future__ import annotations

from cadencia.i18n.fmt import plural
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "block.name_required": "The block needs a name.",
    "block.no_shapes": "A block keeps shapes inserted in the editor; select at least one.",
    "block.not_found": "Block not found.",
    "image.not_found": "Image not found.",
    "version.not_found": "Version not found.",
    # deck_version.label of the copy kept before a slide is restored (written once, decision 8).
    "version.before_restoring_slide": "before restoring slide {key}",
    "diagnostics.fonts": lambda count: (
        f"{count} {plural(count, 'font', 'fonts')} without a "
        "metric-compatible equivalent: text may wrap differently in the editor."
    ),
    "diagnostics.orphan_markers": lambda count: (
        f"{count} {{…}} {plural(count, 'marker', 'markers')} that no field or variable answers."
    ),
    "diagnostics.unbound_areas": lambda count: (
        f"{count} text, table or chart {plural(count, 'area', 'areas')} without a binding."
    ),
    "diagnostics.unnamed_slides": lambda count: (
        f"{count} {plural(count, 'slide', 'slides')} with neither a name nor a title."
    ),
    "diagnostics.silent_images": lambda count: (
        f"{count} template {plural(count, 'image', 'images')} without alternative text."
    ),
    "usage.often_empty": lambda name, count, runs: (
        f"“{name}” came out empty in {count} of {runs} "
        f"{plural(runs, 'generation', 'generations')}: worth removing?"
    ),
    "usage.skipped": "“{name}” stays on screen for less than 3 s when presenting: it is skipped.",
}

SAMPLES = {"usage.often_empty": {"name": "Resumo", "count": 3, "runs": 4}}
