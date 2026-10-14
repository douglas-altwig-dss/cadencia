"""Board views: the work tree, sprint windows, flow, forecast, allocation, dashboard, people and
export texts, and the errors their routes answer with."""

from __future__ import annotations

from cadencia.i18n.fmt import number, plural
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    # The work tree's synthetic nodes.
    "tree.no_epic": "No epic",
    "tree.out_of_scope": "{key} (outside the collected scope)",
    # Progress.coverage_warning.
    "progress.coverage": lambda unestimated, total: (
        f"{unestimated} of {total} {plural(total, 'item', 'items')} without an estimate: "
        "progress by estimate counts only the estimated ones."
    ),
    # SprintTimeline.warnings.
    "timeline.no_start": "The sprint has no start date in Jira: windows are unavailable until it starts.",
    "timeline.no_end": lambda weeks: (
        f"The sprint has no end date in Jira: assuming the configured length of {weeks} "
        f"{plural(weeks, 'week', 'weeks')}."
    ),
    "timeline.end_before_start": lambda weeks: (
        f"The sprint ends before it starts in Jira: assuming the configured length of {weeks} "
        f"{plural(weeks, 'week', 'weeks')}."
    ),
    "timeline.too_long": "The sprint is longer than three weeks: check its dates in Jira.",
    "timeline.partial": lambda index, business_days, days: (
        f"Window {index} is partial: {business_days} business {plural(business_days, 'day', 'days')} "
        f"({number(days, 'en-US', 2)} calendar {plural(days, 'day', 'days')})."
    ),
    # Cumulative flow columns of a board without columns.
    "cfd.todo": "To do",
    "cfd.doing": "In progress",
    "cfd.done": "Done",
    # Names standing in for a missing person or space.
    "no_owner": "Unassigned",
    "no_space": "No space",
    # Forecast notes.
    "forecast.no_pace": "No item was done in the sample period: there is no pace to project.",
    "forecast.beyond": lambda days: (
        f"Some simulations go beyond {days} business {plural(days, 'day', 'days')}."
    ),
    "forecast.epic_caveat": (
        "Uses the whole board's pace; if the epic shares the team with other work, the real date "
        "tends to be later."
    ),
    # Allocation.
    "allocation.disclaimer": (
        "Theoretical allocation by a greedy heuristic: a baseline for conversation, not the truth. "
        "It ignores tacit knowledge, pairing, mentoring and interruptions."
    ),
    "allocation.cycle": "Circular blocking dependency involving {key}.",
    "allocation.no_capacity": lambda count, keys: (
        f"{count} {plural(count, 'item', 'items')} without available capacity: {', '.join(keys)}."
    ),
    # Flow views.
    "flow.principle": (
        "An individual metric without the context of complexity and unplanned work measures the "
        "person's luck, not their work. That is why we show percentiles with their sample, highlight "
        "unplanned work and compare with the boards' median — never a ranked list of people."
    ),
    # Dashboard.
    "dashboard.no_sprint": "No active or closed sprint found for this board.",
    "dashboard.failed": "failed to compute the indicators",
    # 404s and 400s of the board, people, home and export routes.
    "not_found.epic": "Epic {key} is not on this board.",
    "not_found.item": "Item {key} is not on this board.",
    "not_found.view": "Saved view {view_id} does not exist.",
    "not_found.person": "Person not found.",
    "home.duplicate_tiles": "Two home tiles have the same id.",
    "home.config_too_large": "The settings of tile {tile} are too large.",
    "export.unknown": "unknown dataset",
    "export.use_one_of": "Use one of: {datasets}",
    "export.sprint_required": "sprint_id is required",
    "export.sprint_or_board": "give sprint_id or board_id",
    "export.board_required": "board_id is required",
}

SAMPLES = {
    "allocation.no_capacity": {"count": 2, "keys": ["CAD-1", "CAD-2"]},
    "export.use_one_of": {"datasets": "risks, tree"},
}
