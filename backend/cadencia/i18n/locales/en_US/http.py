"""Generic request errors raised by the API's shared dependencies (api/deps.py)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "invalid_name.cause": "invalid name",
    "file_not_found.cause": "file not found",
    "board_not_found.cause": "board not found",
    "board_not_found.message": "Board {board_id} does not exist or has not been discovered yet.",
    "sprint_not_found.cause": "sprint not found",
    "sprint_not_found.message": "Sprint {sprint_id} has not been collected.",
    "issue_not_found.cause": "item not found",
    "issue_not_found.message": "Item {key} has not been collected on any board.",
    "invalid_date.cause": "invalid date",
    # `value` arrives already quoted (repr).
    "invalid_date.message": "{value} is not an ISO date.",
    "invalid_param.cause": "invalid parameter",
}
