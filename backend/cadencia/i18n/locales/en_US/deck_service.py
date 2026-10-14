"""Texts of the presentation service (report/service.py): errors, the download blocker, the
accessibility summary, variable conflicts, run comparison and share links."""

from __future__ import annotations

from cadencia.i18n.fmt import plural
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "writable.typed": (
        "{name} reads from {source}, which is of type “{kind}”. "
        "Variables of that type come whole from their source and take no hand-written value."
    ),
    "source.is_variable": (
        "{key} is another variable. Connect the variable to a data field, not to another variable."
    ),
    "source.unknown": "{key} does not exist in the field catalog.",
    "upload.not_zip": "The file is not a valid .pptx: it is not a zip package.",
    "upload.too_big": (
        "The unpacked .pptx exceeds {mb} MB; check that the file really is the presentation template."
    ),
    "upload.not_pptx": "The file is not a valid .pptx: {error}",
    "asset.not_image": (
        "The file is not an image the presentation accepts (PNG, JPEG, GIF, BMP, TIFF or WMF)."
    ),
    "previews.file_missing": "The template file is no longer on disk.",
    "previews.nothing": "Nothing was rendered.",
    "slide.not_found": "Slide {slide} of template {template}.",
    "template.not_found": "Template not found.",
    "template.not_found_id": "Template {template}.",
    "template.file_missing": "The file of template {template} is no longer on disk.",
    "run.file_missing": "The file of generation {run} is no longer on disk.",
    "run.has_template": "This generation already has a template; only an orphaned one can be reassociated.",
    "version.before_restore": "before restoring version {version}",
    "audience.unknown": "Unknown audience for this template: {audience}.",
    "no_mapping": lambda: "Template without a saved mapping: only the {{…}} markers were filled.",
    "a11y_summary.sem_texto_alternativo": lambda n: (
        f"{n} {plural(n, 'image or chart', 'images or charts')} without alt text."
    ),
    "a11y_summary.contraste_baixo": lambda n: (
        f"{n} {plural(n, 'text', 'texts')} with contrast below the minimum for reading."
    ),
    "a11y_summary.ordem_de_leitura": lambda n: (
        f"{n} {plural(n, 'slide', 'slides')} with the title out of reading order."
    ),
    "review.unknown_action": "Unknown action: {action}.",
    "review.only_delivery": (
        "Only a delivery presentation goes through review, not a preview or a partial one."
    ),
    "review.wrong_state": "The action “{action}” is not possible for a presentation in “{state}”.",
    "review.not_valid": "The presentation failed validation; fix the errors before approving.",
    "review.open_comments": lambda count: (
        f"There {plural(count, 'is', 'are')} {count} open {plural(count, 'comment', 'comments')} "
        f"on the template; resolve {plural(count, 'it', 'them')} before approving."
    ),
    "review.note_required": "Say what needs to change when rejecting.",
    "blocker.invalid.cause": "presentation failed validation",
    "blocker.invalid.action": "Fix the listed errors or download it anyway with ?force=true.",
    "blocker.unapproved.cause": "presentation not approved yet",
    "blocker.unapproved.action": "Send it for review and approve it, or download it anyway with ?force=true.",
    "pdf.failed": "The PDF could not be generated.",
    "compare.chart": "chart {name}: {values}",
    "compare.colors": "colors: {fills}",
    "share.only_delivery": "Only a delivery presentation can be shared.",
    "share.days": "A link is valid for 1 to 90 days.",
    "share.not_found": "Link does not exist, has expired or was revoked.",
    "audit.hide_when_empty": "hide when empty",
    "conflict.shadowed": lambda name, count, template_wins: (
        f"The variable {name} is registered {count} times. "
        + ("The template's one applies." if template_wins else "The shared one applies.")
    ),
    "conflict.field": "{key} is also a catalog field; rename the variable.",
    "migration.name_taken": lambda name, source: (
        f"a variable named {name} already exists"
        + (f", connected to {source}" if source else "")
        + "; rename one of the two before converting."
    ),
    "migration.conflicts": "there are name conflicts; resolve them before converting",
    "migration.description": "Converted from the field {field} (RF-59).",
    "find.required": "enter the text to find",
}

SAMPLES = {
    "conflict.shadowed": {"name": "aviso", "count": 2, "template_wins": True},
    "migration.name_taken": {"name": "riscos_itens", "source": None},
}
