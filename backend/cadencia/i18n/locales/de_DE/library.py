"""Die Präsentationsbibliothek (report/library.py): Bausteine, Bilder, Folienverlauf,
Vorlagendiagnose und Nutzungshinweise."""

from __future__ import annotations

from cadencia.i18n.fmt import plural
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "block.name_required": "Der Baustein braucht einen Namen.",
    "block.no_shapes": "Ein Baustein enthält im Editor eingefügte Formen; wählen Sie mindestens eine aus.",
    "block.not_found": "Baustein nicht gefunden.",
    "image.not_found": "Bild nicht gefunden.",
    "version.not_found": "Version nicht gefunden.",
    "version.before_restoring_slide": "vor dem Wiederherstellen der Folie {key}",
    "diagnostics.fonts": lambda count: (
        f"{count} {plural(count, 'Schriftart', 'Schriftarten')} ohne "
        "metrisch kompatible Entsprechung: Der Text kann im Editor anders umbrechen."
    ),
    "diagnostics.orphan_markers": lambda count: (
        f"{count} {{…}}-Platzhalter, {plural(count, 'den', 'die')} kein Feld und keine Variable beantwortet."
    ),
    "diagnostics.unbound_areas": lambda count: (
        f"{count} Text-, Tabellen- oder Diagramm{plural(count, 'bereich', 'bereiche')} ohne Verknüpfung."
    ),
    "diagnostics.unnamed_slides": lambda count: (
        f"{count} {plural(count, 'Folie', 'Folien')} ohne Namen und ohne Titel."
    ),
    "diagnostics.silent_images": lambda count: (
        f"{count} {plural(count, 'Bild', 'Bilder')} der Vorlage ohne Alternativtext."
    ),
    "usage.often_empty": lambda name, count, runs: (
        f"„{name}“ war in {count} von {runs} {plural(runs, 'Erstellung', 'Erstellungen')} leer: entfernen?"
    ),
    "usage.skipped": "„{name}“ bleibt beim Präsentieren weniger als 3 s sichtbar: Die Folie wird "
    "übersprungen.",
}
