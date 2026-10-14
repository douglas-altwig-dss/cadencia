"""A person's week (RF-85) and the command palette's search (RF-80)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from cadencia.analytics.data import BoardData
from cadencia.analytics.serialize import assessment_dict, issue_brief
from cadencia.domain.models import HierarchyLevel
from cadencia.domain.risk import Situation
from cadencia.store import schema as s

WEEK = timedelta(days=7)


def my_week(
    boards: Sequence[BoardData], account_id: str, now: datetime, base_url: str | None = None
) -> dict[str, Any]:
    """What is on one person's plate: open, at risk, due within a week, finished within a week.

    Across every board in view, because a person's week is not split by board; each item carries
    its board so the list can still be read that way.
    """
    open_items: list[dict[str, Any]] = []
    done: list[dict[str, Any]] = []
    name: str | None = None
    for data in boards:
        tz = ZoneInfo(data.profile.timezone)
        today = now.astimezone(tz).date()
        mine = [
            h
            for h in data.trackable()
            if (owner := h.assignee_at(now)) is not None and owner.account_id == account_id
        ]
        if mine and name is None:
            name = mine[0].assignee_at(now).display_name  # type: ignore[union-attr]
        assessments = data.assess([h for h in mine if not h.is_done_at(now)], now)
        for history in mine:
            brief = {
                **issue_brief(history.issue, base_url),
                "board": {"id": data.board.id, "name": data.board.name},
            }
            done_at = history.done_at(now)
            if done_at is not None:
                if now - done_at <= WEEK:
                    done.append({**brief, "done_at": done_at.isoformat()})
                continue
            if history.status_at(now) is None:
                continue
            due = history.issue.due_date
            brief["risk"] = assessment_dict(assessments.get(history.issue.key))
            brief["due_in_days"] = (due - today).days if due else None
            open_items.append(brief)
    open_items.sort(
        key=lambda i: (
            -i["risk"]["severity"],
            i["due_in_days"] if i["due_in_days"] is not None else 999,
            i["key"],
        )
    )
    due_soon = [i for i in open_items if i["due_in_days"] is not None and i["due_in_days"] <= 7]
    at_risk = [i for i in open_items if i["risk"]["situation"] != Situation.ON_TRACK.value]
    return {
        "person": {"account_id": account_id, "name": name},
        "open": open_items,
        "at_risk": at_risk,
        "due_soon": sorted(due_soon, key=lambda i: i["due_in_days"]),
        "done": sorted(done, key=lambda i: i["done_at"], reverse=True),
        "counts": {
            "open": len(open_items),
            "at_risk": len(at_risk),
            "due_soon": len(due_soon),
            "done": len(done),
        },
    }


def search(session: Session, query: str, limit: int = 8) -> list[dict[str, Any]]:
    """Everything the palette can jump to, best matches first within each kind."""
    q = query.strip()
    if len(q) < 2:
        return []
    like = f"%{q.casefold()}%"
    out: list[dict[str, Any]] = []

    for row in session.scalars(
        select(s.BoardRow)
        .where(func.lower(s.BoardRow.name).like(like))
        .order_by(s.BoardRow.name)
        .limit(limit)
    ):
        out.append(
            {
                "type": "board",
                "id": str(row.id),
                "label": row.name,
                "detail": row.space_name or "",
                "path": f"/boards/{row.id}",
            }
        )

    for row in session.scalars(
        select(s.SprintRow)
        .where(func.lower(s.SprintRow.name).like(like))
        .order_by(s.SprintRow.start_at.desc())
        .limit(limit)
    ):
        out.append(
            {
                "type": "sprint",
                "id": str(row.id),
                "label": row.name,
                "detail": row.state,
                "path": f"/boards/{row.board_id}/sprints/{row.id}",
            }
        )

    upper = q.upper()
    issues = session.scalars(
        select(s.IssueRow)
        .where(
            or_(
                s.IssueRow.key == upper,
                s.IssueRow.key.like(f"{upper}%"),
                func.lower(s.IssueRow.summary).like(like),
            )
        )
        .order_by(s.IssueRow.key == upper, s.IssueRow.updated_at.desc())
        .limit(limit * 2)
    )
    ranked = sorted(issues, key=lambda r: (r.key != upper, not r.key.startswith(upper), r.key))[:limit]
    for row in ranked:
        kind = (
            "iniciativa"
            if row.hierarchy_level >= HierarchyLevel.INITIATIVE
            else "epico"
            if row.hierarchy_level >= HierarchyLevel.EPIC
            else "item"
        )
        out.append(
            {
                "type": kind,
                "id": row.key,
                "label": f"{row.key} {row.summary}",
                "detail": row.status_name,
                "path": f"/issues/{row.key}",
            }
        )

    for row in session.scalars(
        select(s.PersonRow)
        .where(func.lower(s.PersonRow.display_name).like(like))
        .order_by(s.PersonRow.display_name)
        .limit(limit)
    ):
        out.append(
            {
                "type": "pessoa",
                "id": row.account_id,
                "label": row.display_name,
                "detail": "",
                "path": f"/people/{row.account_id}",
            }
        )

    for row in session.scalars(
        select(s.TemplateRow)
        .where(func.lower(s.TemplateRow.name).like(like))
        .order_by(s.TemplateRow.name)
        .limit(limit)
    ):
        out.append(
            {
                "type": "modelo",
                "id": str(row.id),
                "label": row.name,
                "detail": row.filename,
                "path": f"/presentation?template={row.id}",
            }
        )
    return out
