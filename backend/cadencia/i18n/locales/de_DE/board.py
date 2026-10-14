"""Board-Ansichten: Arbeitsbaum, Sprint-Zeitfenster, Fluss, Prognose, Zuordnung, Startseite,
Personen und Export sowie die Fehler ihrer Routen."""

from __future__ import annotations

from cadencia.i18n.fmt import number, plural
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "tree.no_epic": "Kein Epic",
    "tree.out_of_scope": "{key} (außerhalb des abgerufenen Bereichs)",
    "progress.coverage": lambda unestimated, total: (
        f"{unestimated} von {total} {plural(total, 'Vorgang', 'Vorgängen')} ohne Schätzung: "
        "der Fortschritt nach Schätzung berücksichtigt nur die geschätzten."
    ),
    "timeline.no_start": "Sprint ohne Startdatum in Jira: Zeitfenster sind erst verfügbar, wenn er beginnt.",
    "timeline.no_end": lambda weeks: (
        f"Sprint ohne Enddatum in Jira: Die konfigurierte Dauer von {weeks} "
        f"{plural(weeks, 'Woche', 'Wochen')} wird angenommen."
    ),
    "timeline.end_before_start": lambda weeks: (
        f"Sprint endet in Jira vor seinem Start: Die konfigurierte Dauer von {weeks} "
        f"{plural(weeks, 'Woche', 'Wochen')} wird angenommen."
    ),
    "timeline.too_long": "Sprint länger als drei Wochen: Prüfen Sie die Daten in Jira.",
    "timeline.partial": lambda index, business_days, days: (
        f"Zeitfenster {index} ist unvollständig: {business_days} "
        f"{plural(business_days, 'Arbeitstag', 'Arbeitstage')} ({number(days, 'de-DE', 2)} "
        f"{plural(days, 'Kalendertag', 'Kalendertage')})."
    ),
    "cfd.todo": "Zu erledigen",
    "cfd.doing": "In Arbeit",
    "cfd.done": "Fertig",
    "no_owner": "Nicht zugewiesen",
    "no_space": "Kein Bereich",
    "space_not_found": "Der Bereich {key} existiert nicht.",
    "forecast.no_pace": (
        "Im Stichprobenzeitraum wurde kein Vorgang erledigt: Es gibt kein Tempo für eine Prognose."
    ),
    "forecast.beyond": lambda days: (
        f"Ein Teil der Simulationen überschreitet {days} {plural(days, 'Arbeitstag', 'Arbeitstage')}."
    ),
    "forecast.epic_caveat": (
        "Verwendet das Tempo des gesamten Boards; teilt sich das Epic das Team mit anderen Vorhaben, "
        "liegt der tatsächliche Termin eher später."
    ),
    "allocation.disclaimer": (
        "Theoretische Zuordnung per Greedy-Heuristik: eine Grundlage für das Gespräch, keine Wahrheit. "
        "Sie ignoriert implizites Wissen, Pairing, Mentoring und Unterbrechungen."
    ),
    "allocation.cycle": "Zirkuläre Blockade-Abhängigkeit mit {key}.",
    "allocation.no_capacity": lambda count, keys: (
        f"{count} {plural(count, 'Vorgang', 'Vorgänge')} ohne verfügbare Kapazität: {', '.join(keys)}."
    ),
    "flow.principle": (
        "Eine individuelle Kennzahl ohne den Kontext von Komplexität und ungeplanter Arbeit misst das "
        "Glück der Person, nicht ihre Arbeit. Deshalb zeigen wir Perzentile mit Stichprobe, heben "
        "Ungeplantes hervor und vergleichen mit dem Median der Boards — nie eine Rangliste von Personen."
    ),
    "dashboard.no_sprint": "Für dieses Board wurde kein aktiver oder abgeschlossener Sprint gefunden.",
    "dashboard.failed": "Kennzahlen konnten nicht berechnet werden",
    "not_found.epic": "Das Epic {key} ist nicht auf diesem Board.",
    "not_found.item": "Der Vorgang {key} ist nicht auf diesem Board.",
    "not_found.view": "Die gespeicherte Ansicht {view_id} existiert nicht.",
    "not_found.person": "Person nicht gefunden.",
    "home.duplicate_tiles": "Zwei Kacheln der Startseite haben dieselbe Kennung.",
    "home.config_too_large": "Die Einstellungen der Kachel {tile} sind zu groß.",
    "export.unknown": "unbekannter Datensatz",
    "export.use_one_of": "Verwenden Sie einen von: {datasets}",
    "export.sprint_required": "sprint_id ist erforderlich",
    "export.sprint_or_board": "Geben Sie sprint_id oder board_id an",
    "export.board_required": "board_id ist erforderlich",
}
