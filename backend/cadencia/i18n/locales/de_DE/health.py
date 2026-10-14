"""Datenpflege (RF-78): Titel und Maßnahme jeder Prüfung."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "campos_ausentes.title": "Jira-Felder nicht gefunden",
    "campos_ausentes.action": "Geben Sie die Feld-ID unter Einstellungen → Felder an.",
    "coleta_desatualizada.title": "Datenabruf veraltet",
    "coleta_desatualizada.action": (
        "Starten Sie einen Datenabruf auf der Seite Status; schlägt er fehl, steht die Ursache dort."
    ),
    "sem_estimativa.title": "Offene Vorgänge ohne Schätzung",
    "sem_estimativa.action": (
        "Schätzen Sie in Jira: Ohne Schätzung werden der Fortschritt in "
        "Punkten und die Kapazität unterschätzt."
    ),
    "status_sem_coluna.title": "Status außerhalb jeder Board-Spalte",
    "status_sem_coluna.action": (
        "Ordnen Sie diese Status in Jira einer Board-Spalte zu; außerhalb fällt der Vorgang aus dem WIP."
    ),
    "sprint_sem_datas.title": "Sprints ohne Start- oder Enddatum",
    "sprint_sem_datas.action": (
        "Tragen Sie die Sprint-Daten in Jira ein; ohne sie werden die Wochenfenster geschätzt."
    ),
    "em_andamento_sem_responsavel.title": "Vorgänge in Arbeit ohne Bearbeiter",
    "em_andamento_sem_responsavel.action": (
        "Weisen Sie in Jira einen Bearbeiter zu: Zuordnung und Personenansicht sehen diese Vorgänge nicht."
    ),
    "fora_do_time.title": "Bearbeiter, die nicht zum Team des Boards gehören",
    "fora_do_time.action": (
        "Nehmen Sie die Person in die Mitglieder des Boards auf, oder prüfen Sie, ob der Vorgang "
        "wirklich zu diesem Team gehört."
    ),
    "historico_curto.title": "Wenig abgeschlossene Historie",
    "historico_curto.action": (
        "Alterung und Prognose haben geringe Zuverlässigkeit, bis mehr Vorgänge erledigt sind."
    ),
}
