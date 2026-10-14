"""Data health check (RF-78): Jira hygiene problems that silently skew the numbers.

Every metric is only as good as the board it reads. An unestimated item makes the points line lie,
a status outside every column makes WIP undercount, a sprint without dates makes the windows a
guess. None of that is an error anybody sees; this lists them, with who can fix them and where.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from cadencia.analytics.data import BoardData
from cadencia.domain.metrics import LOW_CONFIDENCE_SAMPLE
from cadencia.domain.models import HierarchyLevel, StatusCategory
from cadencia.i18n import tr
from cadencia.jira.fields import FieldMap

EXAMPLES = 8


def _check(
    check_id: str,
    severity: str,
    keys: Sequence[str],
    link: str | None = None,
    count: int | None = None,
) -> dict[str, Any]:
    """One problem. Its title and action are ``health.<check_id>.title``/``.action``, in the
    ambient locale (pt-BR when the deck's appendix is built)."""
    return {
        "id": check_id,
        "severity": severity,  # erro | aviso | info
        "title": tr(f"health.{check_id}.title"),
        "count": len(keys) if count is None else count,
        "examples": list(keys)[:EXAMPLES],
        "all": list(keys),
        "action": tr(f"health.{check_id}.action"),
        "link": link,
    }


def board_health(data: BoardData, field_map: FieldMap, now: datetime) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    sprint = data.current_sprint(now)
    scope = (
        [
            h
            for h in data.sprint_members(sprint.id)
            if h.in_sprint_at(sprint.id, data.reference_for(sprint, now))
        ]
        if sprint is not None
        else data.open_items(now)
    )
    work = [h for h in scope if h.issue.hierarchy_level == HierarchyLevel.STANDARD]

    missing = field_map.missing()
    if missing:
        checks.append(
            _check(
                "campos_ausentes",
                "erro",
                missing,
                "/configuracao?tab=campos",
            )
        )

    if data.freshness(now)["stale"]:
        checks.append(
            _check(
                "coleta_desatualizada",
                "erro",
                [],
                "/status",
                count=1,
            )
        )

    unestimated = sorted(h.issue.key for h in work if h.estimate_at(now) is None and not h.is_done_at(now))
    if unestimated:
        checks.append(
            _check(
                "sem_estimativa",
                "aviso",
                unestimated,
            )
        )

    used = {h.status_at(now) for h in data.trackable() if h.status_at(now) is not None}
    outside = sorted(
        {s.name for s in used if s and data.profile.columns and data.profile.column_of(s.id) is None}
    )
    if outside:
        checks.append(
            _check(
                "status_sem_coluna",
                "aviso",
                outside,
            )
        )

    undated = sorted(
        sp.name
        for sp in data.sprints.values()
        if sp.state in {"active", "closed"} and (sp.start is None or sp.end is None)
    )
    if undated:
        checks.append(
            _check(
                "sprint_sem_datas",
                "aviso",
                undated,
            )
        )

    unowned = sorted(
        h.issue.key
        for h in work
        if (status := h.status_at(now)) is not None
        and status.category is StatusCategory.IN_PROGRESS
        and h.assignee_at(now) is None
    )
    if unowned:
        checks.append(
            _check(
                "em_andamento_sem_responsavel",
                "aviso",
                unowned,
            )
        )

    if data.profile.members:
        members = set(data.profile.members)
        strangers = sorted(
            {
                owner.display_name
                for h in work
                if (owner := h.assignee_at(now)) is not None and owner.account_id not in members
            }
        )
        if strangers:
            checks.append(
                _check(
                    "fora_do_time",
                    "info",
                    strangers,
                    f"/configuracao?tab=boards&board={data.board.id}",
                )
            )

    completed = data.completed_metrics(now)
    if len(completed) < LOW_CONFIDENCE_SAMPLE:
        checks.append(
            _check(
                "historico_curto",
                "info",
                [],
                count=len(completed),
            )
        )

    order = {"erro": 0, "aviso": 1, "info": 2}
    checks.sort(key=lambda c: (order[c["severity"]], c["id"]))
    return {
        "board": {"id": data.board.id, "name": data.board.name, "space_name": data.board.space_name},
        "ok": not any(c["severity"] in {"erro", "aviso"} for c in checks),
        "checks": checks,
    }
