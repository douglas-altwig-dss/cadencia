"""Texte des Präsentationsdienstes (report/service.py)."""

from __future__ import annotations

from cadencia.i18n.fmt import plural
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "writable.typed": (
        "{name} liest aus {source}, das vom Typ „{kind}“ ist. "
        "Variablen dieses Typs kommen vollständig aus der Quelle und nehmen keinen von Hand geschriebenen "
        "Wert an."
    ),
    "source.is_variable": (
        "{key} ist eine andere Variable. Verbinden Sie die Variable mit einem Datenfeld, nicht mit einer "
        "anderen Variable."
    ),
    "source.unknown": "{key} gibt es im Feldkatalog nicht.",
    "upload.not_zip": "Die Datei ist keine gültige .pptx: Sie ist kein ZIP-Paket.",
    "upload.too_big": (
        "Die entpackte .pptx überschreitet {mb} MB; prüfen Sie, ob die Datei wirklich die "
        "Präsentationsvorlage ist."
    ),
    "upload.not_pptx": "Die Datei ist keine gültige .pptx: {error}",
    "asset.not_image": (
        "Die Datei ist kein Bild, das die Präsentation akzeptiert (PNG, JPEG, GIF, BMP, TIFF oder WMF)."
    ),
    "previews.file_missing": "Die Vorlagendatei ist nicht mehr auf dem Datenträger.",
    "previews.nothing": "Es wurde nichts dargestellt.",
    "slide.not_found": "Folie {slide} der Vorlage {template}.",
    "template.not_found": "Vorlage nicht gefunden.",
    "template.not_found_id": "Vorlage {template}.",
    "template.file_missing": "Die Datei der Vorlage {template} ist nicht mehr auf dem Datenträger.",
    "run.file_missing": "Die Datei der Erstellung {run} ist nicht mehr auf dem Datenträger.",
    "run.has_template": (
        "Diese Erstellung hat bereits eine Vorlage; nur eine verwaiste kann neu zugeordnet werden."
    ),
    "version.before_restore": "vor dem Wiederherstellen von Version {version}",
    "audience.unknown": "Unbekanntes Publikum für diese Vorlage: {audience}.",
    "no_mapping": lambda: "Vorlage ohne gespeicherte Zuordnung: Nur die Platzhalter {{…}} wurden gefüllt.",
    "a11y_summary.sem_texto_alternativo": lambda n: (
        f"{n} {plural(n, 'Bild oder Diagramm', 'Bilder oder Diagramme')} ohne Alternativtext."
    ),
    "a11y_summary.contraste_baixo": lambda n: (
        f"{n} {plural(n, 'Text', 'Texte')} mit einem Kontrast unter dem Mindestwert für die Lesbarkeit."
    ),
    "a11y_summary.ordem_de_leitura": lambda n: (
        f"{n} {plural(n, 'Folie', 'Folien')} mit dem Titel außerhalb der Lesereihenfolge."
    ),
    "review.unknown_action": "Unbekannte Aktion: {action}.",
    "review.only_delivery": (
        "Nur eine Lieferpräsentation durchläuft die Prüfung, keine Vorschau und keine Teilerstellung."
    ),
    "review.wrong_state": (
        "Die Aktion „{action}“ ist für eine Präsentation im Status „{state}“ nicht möglich."
    ),
    "review.not_valid": (
        "Die Präsentation hat die Validierung nicht bestanden; beheben Sie die Fehler vor der Freigabe."
    ),
    "review.open_comments": lambda count: (
        f"Es gibt {count} {plural(count, 'offenen Kommentar', 'offene Kommentare')} "
        "zur Vorlage; erledigen Sie diese vor der Freigabe."
    ),
    "review.note_required": "Sagen Sie beim Ablehnen, was geändert werden muss.",
    "blocker.invalid.cause": "Präsentation hat die Validierung nicht bestanden",
    "blocker.invalid.action": (
        "Beheben Sie die aufgeführten Fehler oder laden Sie sie trotzdem mit ?force=true herunter."
    ),
    "blocker.unapproved.cause": "Präsentation noch nicht freigegeben",
    "blocker.unapproved.action": (
        "Senden Sie sie zur Prüfung und geben Sie sie frei, oder laden Sie sie trotzdem mit ?force=true "
        "herunter."
    ),
    "pdf.failed": "Das PDF konnte nicht erstellt werden.",
    "compare.chart": "Diagramm {name}: {values}",
    "compare.colors": "Farben: {fills}",
    "share.only_delivery": "Nur eine Lieferpräsentation kann geteilt werden.",
    "share.days": "Ein Link gilt 1 bis 90 Tage.",
    "share.not_found": "Link existiert nicht, ist abgelaufen oder wurde widerrufen.",
    "audit.hide_when_empty": "ausblenden, wenn leer",
    "conflict.shadowed": lambda name, count, template_wins: (
        f"Die Variable {name} ist {count}-mal registriert. "
        + ("Es gilt die der Vorlage." if template_wins else "Es gilt die gemeinsame.")
    ),
    "conflict.field": "{key} ist auch ein Feld des Katalogs; benennen Sie die Variable um.",
    "migration.name_taken": lambda name, source: (
        f"es gibt bereits eine Variable namens {name}"
        + (f", verbunden mit {source}" if source else "")
        + "; benennen Sie eine der beiden vor dem Umwandeln um."
    ),
    "migration.conflicts": "es gibt Namenskonflikte; lösen Sie sie vor dem Umwandeln",
    "migration.description": "Umgewandelt aus dem Feld {field} (RF-59).",
    "find.required": "Geben Sie den zu suchenden Text ein",
}
