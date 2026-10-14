"""Probleme bei der Erstellung, der Prüfung, den manuellen Bearbeitungen, der Vorschau und dem
Zuordnungsvorschlag eines Foliensatzes."""

from __future__ import annotations

from cadencia.i18n.fmt import plural
from cadencia.i18n.render import Entry


def _in_template(template: str) -> str:
    return f" in der Vorlage „{template}“" if template else ""


MESSAGES: dict[str, Entry] = {
    # report/core/generate.py
    "repeat.out_of_scope": "Kein Board liegt im Geltungsbereich dieses Blocks: wiederholte Folien entfernt.",
    "repeat.no_board": "Kein Board in dieser Erstellung: wiederholte Folien entfernt.",
    "board_without_data": "Folie {slide}: Board {board} hat in dieser Erstellung keine Daten.",
    "variable_unregistered": lambda slide, marker, template: (
        f"Folie {slide}: Die Variable {marker}{_in_template(template)} ist nicht registriert. "
        "Registrieren Sie sie in der Variablenverwaltung, bevor Sie sie in der Vorlage verwenden."
    ),
    "unknown_field": "Folie {slide}: Das Feld {field} gibt es im Katalog nicht.",
    "variable_unfilled": lambda slide, marker, template, target: (
        f"Folie {slide}: Die Variable {marker}{_in_template(template)} hat keinen Wert für "
        f"„{target or 'den Bericht'}“, und die Registrierung legt keinen Standardwert fest."
    ),
    "unknown_modifier": (
        "Folie {slide}: {marker} verwendet einen unbekannten Modifikator; verwenden Sie {modifiers}."
    ),
    "marker_empty": "Platzhalter {marker} ist leer geblieben.",
    "no_rows": "Folie {slide}: {field} hat keine Zeilen.",
    "truncated": lambda slide, count: (
        f"Folie {slide}: {count} {plural(count, 'Zeile passte', 'Zeilen passten')} nicht und "
        f"{plural(count, 'wurde', 'wurden')} weggelassen."
    ),
    "missing_area": "Folie {slide}: Den Bereich {target} gibt es in der Vorlage nicht.",
    "not_text": "Folie {slide}: {target} nimmt keinen Text auf.",
    "empty": lambda slide, field: f"Folie {slide}: {field or 'Der Wert'} ist leer geblieben.",
    # report/core/validate.py
    "table_overflow": "Folie {slide}: Die Tabelle „{area}“ reicht über das Ende der Folie hinaus.",
    "text_exceeds_area": "Folie {slide}: Der Text von „{area}“ überschreitet den vorgesehenen Bereich.",
    "text_does_not_fit": "Folie {slide}: Der Text von „{area}“ passt nicht in das Feld.",
    "libreoffice_missing": (
        "LibreOffice ist nicht installiert: Die automatische Sichtprüfung ist nicht verfügbar."
    ),
    "libreoffice_failed": "Darstellung mit LibreOffice fehlgeschlagen: {error}",
    "template_changed": (
        "Die Vorlage hat sich seit dem Speichern der Zuordnung geändert; prüfen Sie die Bereiche."
    ),
    "area_missing_in_template": "Den Bereich {target} gibt es in der aktuellen Version der Vorlage nicht.",
    "leftover_marker": "Folie {slide}: Platzhalter {marker} wurde nicht ersetzt.",
    # report/core/edits.py
    "edit.table_gone": "Die Tabelle {table} gibt es auf dieser Folie nicht mehr.",
    "edit.cell_outside": "Die Zelle {row},{column} liegt außerhalb der Tabelle {table}.",
    "edit.group_gone": "Die Gruppe {group} gibt es auf dieser Folie nicht mehr.",
    "edit.shape_gone": (
        "Die Form {shape} gibt es auf dieser Folie nicht mehr; die Bearbeitung wurde ignoriert."
    ),
    "edit.image_gone": "Das Bild der Form {shape} ist nicht mehr verfügbar.",
    "edit.duplicate_orphaned": (
        "Die duplizierte Folie {slide} hat ihre Quelle verloren; sie wurde nicht neu erstellt."
    ),
    # report/core/resolve_preview.py
    "preview.fixed_board_unset": (
        "Diese Folie gehört zu einem festen Board, aber es wurde kein Board gewählt."
    ),
    "preview.no_board_data": "Keine Board-Daten: Die Vorschau zeigt nur die Vorlage.",
    "preview.variable_unregistered": lambda marker, template: (
        f"Die Variable {marker} ist{_in_template(template)} nicht registriert. "
        "Registrieren Sie sie in der Variablenverwaltung, bevor Sie sie verwenden."
    ),
    "preview.variable_unfilled": (
        "Die Variable {marker} hat keinen Wert für „{target}“, und die Registrierung legt keinen "
        "Standardwert fest."
    ),
    "preview.unknown_field": "Das Feld {field} gibt es im Katalog nicht.",
    "preview.empty": lambda field: f"{field or 'Fester Text'} ist derzeit leer.",
    # report/core/suggest.py
    "suggest.continuation": (
        "Folie {slide} sieht wie die Fortsetzung der vorherigen aus: zum Entfernen markiert "
        "(die Seitenaufteilung erzeugt Fortsetzungen neu)."
    ),
    "suggest.choose_board": lambda slide, headline: (
        f"Folie {slide} ({headline or 'ohne Titel'}): Wählen Sie das Board."
    ),
}
