"""The Apresentação routes (api/routes_reports.py, api/routes_deck.py) and audience Q&A
(report/qanda.py): their 400/404/409/413/503 bodies."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "too_large.message": "Limit is {mb} MB.",
    "template_too_large.cause": "template too large",
    "image_too_large.cause": "image too large",
    "template_not_found.cause": "template not found",
    "template_not_found.message": "Template {template_id}.",
    "template_file_not_found.cause": "template file not found",
    "template_file_gone.cause": "the template file is no longer on disk",
    "template_image_not_found.cause": "image not found in the template",
    "format_invalid.cause": "invalid format",
    "format_invalid.message": "Send a .pptx file.",
    "variable_invalid.cause": "invalid variable",
    "variable_invalid.action": "Use a lowercase name without spaces (e.g. space_definition).",
    "variable_not_found.cause": "variable not found",
    "value_invalid.cause": "invalid value",
    "value_not_found.cause": "value not found",
    "slide_not_found.cause": "slide not found",
    "slide_not_found.message": "Slide {slide_id} of template {template_id}.",
    "unknown_areas.cause": "areas that do not exist in the template",
    "clone_without_mapping": "The source template has no saved mapping.",
    "area_lost_after_remap.cause": "area not found after remapping",
    "font_unavailable.cause": "font not available",
    "run_not_found.cause": "generation not found",
    "run_file_not_found.cause": "generation file not found",
    "deck_not_found.cause": "presentation not found",
    "deck_not_found.message": "Generation {run_id}.",
    "edits_conflict.cause": "the edits changed while you were editing",
    "edits_conflict.action": "Reload the editor to get the current version before saving.",
    "image_not_found.cause": "image not found",
    "slide_image_not_found.cause": "image not found on the slide",
    "version_not_found.cause": "version not found",
    "version_not_found.message": "Version {version_id}.",
    "version_name_missing.cause": "name missing",
    "version_name_missing.message": "Give the version a name.",
    "comment_not_found.cause": "comment not found",
    "nothing_to_regenerate.cause": "nothing to regenerate",
    "nothing_to_regenerate.message": "Choose slides or boards.",
    "share_not_found.cause": "link not found",
    "share_unavailable.cause": "link does not exist, has expired or was revoked",
    # Who is in the editor when neither nginx nor the browser says.
    "anonymous": "Someone without a name",
    "board_without_data.cause": "board without data",
    "ai_unavailable.cause": "AI suggestion unavailable",
    "ai_unavailable.action": "Write the text by hand, or ask an administrator to turn on "
    "CADENCIA_AI_ENABLED.",
    "question_empty": "The question is empty.",
    "question_not_found": "Question not found.",
}
