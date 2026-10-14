"""Die Kommandozeile (cli.py): Hilfetexte und die wenigen Meldungen, die sie selbst ausgibt."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "description": "Cadência — Lieferverfolgung in Jira",  # i18n: out of scope (product name)
    "no_space": "Kein Bereich",
    "error.sprint_not_collected": "Sprint {sprint} nicht abgerufen",
    "error.template_not_found": "Vorlage {template} nicht gefunden",
    "error.demo_not_empty": "die Datenbank enthält bereits Boards; verwenden Sie --force, um "
    "Demodaten hinzuzufügen, oder richten Sie CADENCIA_DATABASE_URL auf eine andere Datenbank",
    "help.db_upgrade": "wendet die Datenbankmigrationen an",
    "help.test_connection": "prüft die Jira-Anmeldedaten",
    "help.discover": "M0: Boards, benutzerdefinierte Felder und Status der Instanz",
    "help.boards": "listet erkannte Boards auf und markiert die verfolgten",
    "help.boards.q": "Filter nach Board- oder Bereichsname",
    "help.boards.select": "zu verfolgende IDs (ersetzt die Auswahl)",
    "help.spaces": "listet die Bereiche (Teams) mit ihren Boards auf",
    "help.spaces.selected": "nur verfolgte Boards",
    "help.check_deck": "prüft eine .pptx als OOXML-Paket; endet mit Fehler, wenn ungültig",
    "help.check_deck.file": "zu prüfende .pptx-Dateien",
    "help.check_variables": "listet in Vorlagen verwendete Variablen ohne Registrierung oder Wert "
    "auf; endet mit Fehler, wenn es welche gibt",
    "help.template_filter": "beschränkt auf eine Vorlage",
    "help.migrate_bindings": "zeigt, was die Umwandlung alter Verknüpfungen (field:) in Variablen "
    "bewirken würde; schreibt nichts",
    "help.migrate_bindings.apply": "schreibt: registriert die Variablen und setzt die Verknüpfungen neu",
    "help.migrate_palette": "zeigt Vorlagen, deren Palette nur eine Kopie der gemeinsamen ist; "
    "--apply lässt sie erben",
    "help.migrate_palette.apply": "schreibt: entfernt die überflüssigen Kopien",
    "help.collect": "ruft die ausgewählten Boards ab",
    "help.collect.full": "vollständiger Abgleich",
    "help.collect.board": "beschränkt auf ein Board (wiederholbar)",
    "help.checkpoint": "schreibt Checkpoint-Snapshots bzw. führt sie erneut aus",
    "help.checkpoint.at": "ISO-Zeitpunkt eines bestimmten Checkpoints",
    "help.checkpoint.force": "überschreibt vorhandene Snapshots",
    "help.summary": "M1: Zusammenfassung eines Sprints als JSON",
    "help.manifest": "M0: Manifest der ersetzbaren Bereiche einer .pptx",
    "help.template_add": "registriert eine .pptx-Vorlage",
    "help.mapping": "Zuordnung einer Vorlage",
    "help.mapping.file": "JSON der Zuordnung (für set)",
    "help.deck": "erstellt die Präsentation",
    "help.deck.reference": "Bezugszeitpunkt (Standard: letzter Checkpoint)",
    "help.deck.no_render": "erstellt keine Vorschauen mit LibreOffice",
    "help.serve": "startet die API",
    "help.scheduler": "geplanter Abrufdienst",
    "help.demo": "füllt die Datenbank mit der fiktiven Demo-Instanz",
    "help.demo.force": "akzeptiert eine Datenbank, die bereits Boards enthält",
}
