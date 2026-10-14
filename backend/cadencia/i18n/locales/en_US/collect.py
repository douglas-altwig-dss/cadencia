"""Collection: what it records when a board stops, and the setup routes' answers."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    # collector_run.error when no board is selected.
    "no_board_selected": "no board selected",
    # A board run somebody cancelled (RF-82).
    "cancelled.message": "Collection cancelled on request.",
    "cancelled.cause": "cancelled",
    "cancelled.action": "Run it again whenever you like; nothing was half written.",
    # A board run that failed with something other than a Jira error.
    "unexpected.cause": "unexpected error",
    "unexpected.action": "See this run's structured log.",
    # Setup routes.
    "jira_not_configured.cause": "Jira not configured",
    "jira_not_configured.action": "Set CADENCIA_JIRA_BASE_URL, CADENCIA_JIRA_EMAIL and "
    "CADENCIA_JIRA_API_TOKEN (environment variable or a file in /run/secrets).",
    "no_space": "No space",
    "board_not_found": "board not found",
    "board_unknown": "Board {board} does not exist or has not been discovered yet.",
    "board_detail": "Board {board}.",
    "nothing_running": "no collection in progress",
    "already_running.cause": "collection in progress",
    "already_running.action": "Wait for the current collection to finish.",
}
