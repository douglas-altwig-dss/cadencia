"""Problems found while generating a deck, validating it, replaying manual edits, previewing a
slide and suggesting a mapping (report/core). Stored as ``$msg`` records in
``report_run.validation`` and rendered for whoever reads them."""

from __future__ import annotations

from cadencia.i18n.fmt import plural
from cadencia.i18n.render import Entry


def _in_template(template: str) -> str:
    return f" in the template “{template}”" if template else ""


MESSAGES: dict[str, Entry] = {
    # report/core/generate.py
    "repeat.out_of_scope": "No board is within this block's scope: repeated slides removed.",
    "repeat.no_board": "No board in this generation: repeated slides removed.",
    "board_without_data": "Slide {slide}: board {board} has no data in this generation.",
    "variable_unregistered": lambda slide, marker, template: (
        f"Slide {slide}: the variable {marker}{_in_template(template)} is not registered. "
        "Register it in the variable manager before using it in the template."
    ),
    "unknown_field": "Slide {slide}: the field {field} does not exist in the catalog.",
    "variable_unfilled": lambda slide, marker, template, target: (
        f"Slide {slide}: the variable {marker}{_in_template(template)} has no value for "
        f"“{target or 'the report'}” and its registration sets no default."
    ),
    "unknown_modifier": "Slide {slide}: {marker} uses an unknown modifier; use {modifiers}.",
    "marker_empty": "Marker {marker} came out empty.",
    "no_rows": "Slide {slide}: {field} has no rows.",
    "truncated": lambda slide, count: (
        f"Slide {slide}: {count} {plural(count, 'row', 'rows')} did not fit and "
        f"{plural(count, 'was', 'were')} left out."
    ),
    "missing_area": "Slide {slide}: the area {target} does not exist in the template.",
    "not_text": "Slide {slide}: {target} does not take text.",
    "empty": lambda slide, field: f"Slide {slide}: {field or 'the value'} came out empty.",
    # report/core/validate.py
    "table_overflow": "Slide {slide}: the table “{area}” runs past the end of the slide.",
    "text_exceeds_area": "Slide {slide}: the text of “{area}” exceeds its area.",
    "text_does_not_fit": "Slide {slide}: the text of “{area}” does not fit its box.",
    "libreoffice_missing": "LibreOffice is not installed: automatic visual check unavailable.",
    "libreoffice_failed": "Rendering with LibreOffice failed: {error}",
    "template_changed": "The template changed since the mapping was saved; check the areas.",
    "area_missing_in_template": "The area {target} does not exist in the current version of the template.",
    "leftover_marker": "Slide {slide}: marker {marker} was not replaced.",
    # report/core/edits.py
    "edit.table_gone": "The table {table} no longer exists on this slide.",
    "edit.cell_outside": "Cell {row},{column} is outside the table {table}.",
    "edit.group_gone": "The group {group} no longer exists on this slide.",
    "edit.shape_gone": "The shape {shape} no longer exists on this slide; the edit was ignored.",
    "edit.image_gone": "The image of shape {shape} is no longer available.",
    "edit.duplicate_orphaned": "The duplicated slide {slide} lost its source; it was not recreated.",
    # report/core/resolve_preview.py
    "preview.fixed_board_unset": "This slide belongs to a fixed board, but no board was chosen.",
    "preview.no_board_data": "No board data: the preview shows the template only.",
    "preview.variable_unregistered": lambda marker, template: (
        f"The variable {marker} is not registered{_in_template(template)}. "
        "Register it in the variable manager before using it."
    ),
    "preview.variable_unfilled": (
        "The variable {marker} has no value for “{target}” and its registration sets no default."
    ),
    "preview.unknown_field": "The field {field} does not exist in the catalog.",
    "preview.empty": lambda field: f"{field or 'Fixed text'} is empty right now.",
    # report/core/suggest.py
    "suggest.continuation": (
        "Slide {slide} looks like a continuation of the previous one: marked for removal "
        "(pagination recreates continuations)."
    ),
    "suggest.choose_board": lambda slide, headline: (
        f"Slide {slide} ({headline or 'untitled'}): choose the board."
    ),
}

SAMPLES = {
    "variable_unfilled": {"slide": 2, "marker": "{{texto.x}}", "template": "Semanal", "target": None},
    "empty": {"slide": 2, "field": None},
    "preview.empty": {"field": None},
    "suggest.choose_board": {"slide": 3, "headline": None},
}
