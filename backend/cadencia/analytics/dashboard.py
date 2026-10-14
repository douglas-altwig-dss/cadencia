"""Executive dashboard (RF-30): one row per board, grouped by space, answering "where do I look
today". A space is the team; the boards under it are how that team organises its work."""

from __future__ import annotations

import logging
from collections.abc import Callable, Collection, Mapping
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from cadencia.analytics.data import BoardData, load_board
from cadencia.analytics.serialize import iso, progress_dict, sprint_dict, window_dict
from cadencia.analytics.sprint import risk_counts
from cadencia.domain.calendar import calendar_windows, sprint_timeline
from cadencia.domain.commitment import commitment_report
from cadencia.domain.compare import compare_window
from cadencia.domain.hierarchy import progress_of
from cadencia.domain.metrics import throughput
from cadencia.domain.models import HierarchyLevel
from cadencia.i18n import render, stored_text, tr
from cadencia.store import repo

log = logging.getLogger(__name__)
TREND_SPRINTS = 4


def dashboard_row(
    data: BoardData, now: datetime, committed: Callable[[int], Collection[str] | None] | None = None
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "board": {
            "id": data.board.id,
            "name": data.board.name,
            "type": data.board.type,
            "space_key": data.board.space_key,
            "space_name": data.board.space_name,
        },
        "freshness": data.freshness(now),
        "sprint": None,
        "window": None,
        "progress": None,
        "risk_counts": {},
        "throughput": {"current": None, "previous": None},
        "trend": [],
        "warnings": [],
    }
    sprint = data.current_sprint(now)
    if sprint is None:
        windows = calendar_windows(data.profile, now, TREND_SPRINTS)
        counts = throughput(data.work_items(), windows)
        row["trend"] = [
            {"label": f"S{w.index}", "delivered": c, "committed": None, "added": None}
            for w, c in zip(windows, counts, strict=True)
        ]
        row["throughput"] = {
            "current": counts[-1] if counts else None,
            "previous": counts[-2] if len(counts) > 1 else None,
        }
        row["risk_counts"] = risk_counts(data.assess(data.open_items(now), now).values())
        if data.board.type == "scrum":
            row["warnings"].append(tr("board.dashboard.no_sprint"))
        return row

    reference = data.reference_for(sprint, now)
    timeline = sprint_timeline(sprint, data.profile)
    scope = data.sprint_members(sprint.id)
    work_scope = [h for h in scope if h.issue.hierarchy_level == HierarchyLevel.STANDARD]
    current = [h for h in scope if h.in_sprint_at(sprint.id, reference)]
    work = [h for h in current if h.issue.hierarchy_level == HierarchyLevel.STANDARD]
    row["sprint"] = sprint_dict(sprint)
    row["progress"] = progress_dict(
        progress_of([h.issue for h in work], is_done=lambda i: data.histories[i.key].is_done_at(reference))
    )
    row["risk_counts"] = risk_counts(
        data.assess([h for h in current if h.issue.hierarchy_level < HierarchyLevel.EPIC], reference).values()
    )
    window = timeline.current_window(reference)
    if window is not None:
        row["window"] = {**window_dict(window), "total": len(timeline.windows)}
        row["throughput"]["current"] = len(
            compare_window(work_scope, window.start, min(window.end, reference), sprint.id).completed
        )
        previous = [w for w in timeline.windows if w.index == window.index - 1]
        if previous:
            w = previous[0]
            row["throughput"]["previous"] = len(
                compare_window(work_scope, w.start, w.end, sprint.id).completed
            )
    trend_sprints = data.closed_sprints(now, TREND_SPRINTS)
    if sprint.state == "active":
        trend_sprints.append(sprint)
    for item in trend_sprints:
        report = commitment_report(
            data.sprint_members(item.id), item, now, committed(item.id) if committed else None
        )
        row["trend"].append(
            {
                "label": item.name,
                "delivered": report.board.delivered,
                "committed": report.board.committed,
                "added": report.board.added,
                "open": item.state == "active",
            }
        )
    row["warnings"] += [render(w) for w in timeline.warnings]
    return row


def dashboard(
    session: Session, defaults: Mapping[str, Any], now: datetime, *, history_days: int = 120
) -> dict[str, Any]:
    rows = []
    for board_row in repo.selected_boards(session):
        try:
            data = load_board(session, board_row.id, defaults, history_days)

            def committed(sprint_id: int) -> Collection[str] | None:
                return repo.load_commitment(session, sprint_id)

            rows.append(dashboard_row(data, now, committed))
        except Exception as exc:  # one broken board must not blank the dashboard
            log.exception("falha ao montar a linha do board %s", board_row.id)
            rows.append(
                {
                    "board": {
                        "id": board_row.id,
                        "name": board_row.name,
                        "type": board_row.type,
                        "space_key": board_row.space_key,
                        "space_name": board_row.space_name,
                    },
                    "error": {"cause": tr("board.dashboard.failed"), "message": str(exc)},
                    "freshness": {
                        "last_success_at": board_row.last_success_at,
                        "last_error": stored_text(
                            (board_row.last_error_i18n or {}).get("message"), board_row.last_error
                        ),
                    },
                }
            )
    return {"generated_at": iso(now), "rows": rows}
