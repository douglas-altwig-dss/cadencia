"""Die Präsentations-Routen (api/routes_reports.py, api/routes_deck.py) und Publikumsfragen
(report/qanda.py): ihre 400/404/409/413/503-Antworten."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "too_large.message": "Höchstens {mb} MB.",
    "template_too_large.cause": "Vorlage zu groß",
    "image_too_large.cause": "Bild zu groß",
    "template_not_found.cause": "Vorlage nicht gefunden",
    "template_not_found.message": "Vorlage {template_id}.",
    "template_file_not_found.cause": "Vorlagendatei nicht gefunden",
    "template_file_gone.cause": "die Vorlagendatei liegt nicht mehr auf dem Datenträger",
    "template_image_not_found.cause": "Bild in der Vorlage nicht gefunden",
    "format_invalid.cause": "ungültiges Format",
    "format_invalid.message": "Senden Sie eine .pptx-Datei.",
    "variable_invalid.cause": "ungültige Variable",
    "variable_invalid.action": "Verwenden Sie einen kleingeschriebenen Namen ohne Leerzeichen "
    "(z. B. bereich_definition).",
    "variable_not_found.cause": "Variable nicht gefunden",
    "value_invalid.cause": "ungültiger Wert",
    "value_not_found.cause": "Wert nicht gefunden",
    "slide_not_found.cause": "Folie nicht gefunden",
    "slide_not_found.message": "Folie {slide_id} der Vorlage {template_id}.",
    "unknown_areas.cause": "Bereiche, die es in der Vorlage nicht gibt",
    "clone_without_mapping": "Die Quellvorlage hat keine gespeicherte Zuordnung.",
    "area_lost_after_remap.cause": "Bereich nach der Neuzuordnung nicht gefunden",
    "font_unavailable.cause": "Schriftart nicht verfügbar",
    "run_not_found.cause": "Erstellung nicht gefunden",
    "run_file_not_found.cause": "Datei der Erstellung nicht gefunden",
    "deck_not_found.cause": "Präsentation nicht gefunden",
    "deck_not_found.message": "Erstellung {run_id}.",
    "edits_conflict.cause": "die Bearbeitungen haben sich geändert, während Sie bearbeitet haben",
    "edits_conflict.action": "Laden Sie den Editor neu, um vor dem Speichern die aktuelle Version zu "
    "erhalten.",
    "image_not_found.cause": "Bild nicht gefunden",
    "slide_image_not_found.cause": "Bild auf der Folie nicht gefunden",
    "version_not_found.cause": "Version nicht gefunden",
    "version_not_found.message": "Version {version_id}.",
    "version_name_missing.cause": "Name fehlt",
    "version_name_missing.message": "Geben Sie der Version einen Namen.",
    "comment_not_found.cause": "Kommentar nicht gefunden",
    "nothing_to_regenerate.cause": "nichts neu zu erstellen",
    "nothing_to_regenerate.message": "Wählen Sie Folien oder Boards.",
    "share_not_found.cause": "Link nicht gefunden",
    "share_unavailable.cause": "Link existiert nicht, ist abgelaufen oder wurde widerrufen",
    "anonymous": "Jemand ohne Namen",
    "board_without_data.cause": "Board ohne Daten",
    "ai_unavailable.cause": "KI-Vorschlag nicht verfügbar",
    "ai_unavailable.action": "Schreiben Sie den Text von Hand oder bitten Sie die Administration, "
    "CADENCIA_AI_ENABLED einzuschalten.",
    "question_empty": "Die Frage ist leer.",
    "question_not_found": "Frage nicht gefunden.",
}
