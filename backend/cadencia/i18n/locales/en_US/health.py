"""Data health check (RF-78): one title and one action per check id."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "campos_ausentes.title": "Jira fields not found",
    "campos_ausentes.action": "Enter the field id in Settings → Fields.",
    "coleta_desatualizada.title": "Collection out of date",
    "coleta_desatualizada.action": "Run a collection on the Status page; if it fails, the cause shows there.",
    "sem_estimativa.title": "Open items without an estimate",
    "sem_estimativa.action": (
        "Estimate them in Jira: without it, progress in points and capacity are underestimated."
    ),
    "status_sem_coluna.title": "Statuses outside every board column",
    "status_sem_coluna.action": (
        "Map these statuses to a board column in Jira; outside one the item drops out of WIP."
    ),
    "sprint_sem_datas.title": "Sprints without a start or end date",
    "sprint_sem_datas.action": (
        "Fill in the sprint dates in Jira; without them the weekly windows are estimated."
    ),
    "em_andamento_sem_responsavel.title": "Items in progress without an assignee",
    "em_andamento_sem_responsavel.action": (
        "Assign someone in Jira: allocation and the per-person view do not see these items."
    ),
    "fora_do_time.title": "Assignees who are not on the board's team",
    "fora_do_time.action": (
        "Add the person to the board's members, or check that the item really belongs to this team."
    ),
    "historico_curto.title": "Little completed history",
    "historico_curto.action": "Aging and forecast have low confidence until more items are done.",
}
