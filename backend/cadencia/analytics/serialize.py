"""JSON-ready views of domain objects, shared by the API, exports and the CLI.

Text is rendered here, in the ambient locale (the request's, else ``CADENCIA_LOCALE``, pt-BR while
the deck's data is built): the domain hands over ``Msg`` values.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from cadencia.domain.calendar import Window
from cadencia.domain.hierarchy import Progress, TreeNode
from cadencia.domain.models import Issue, Sprint
from cadencia.domain.risk import Evidence, RiskAssessment, Situation
from cadencia.i18n import STORAGE_LOCALE, localize, render


def iso(value: datetime | date | None) -> str | None:
    return value.isoformat() if value is not None else None


def local_day(value: datetime | None, tz: str, fmt: str = "%d/%m/%Y") -> str:
    if value is None:
        return ""
    return value.astimezone(ZoneInfo(tz)).strftime(fmt)


def issue_url(base_url: str | None, key: str) -> str | None:
    return f"{base_url.rstrip('/')}/browse/{key}" if base_url else None


def issue_brief(issue: Issue, base_url: str | None = None) -> dict[str, Any]:
    return {
        "key": issue.key,
        "summary": issue.summary,
        "type": issue.type_name,
        "level": issue.hierarchy_level,
        "status": issue.status.name,
        "category": issue.status.category.value,
        "assignee": issue.assignee.display_name if issue.assignee else None,
        "assignee_id": issue.assignee.account_id if issue.assignee else None,
        "estimate": issue.estimate,
        "due_date": iso(issue.due_date),
        "parent_key": issue.parent_key,
        "labels": list(issue.labels),
        "components": list(issue.components),
        "url": issue_url(base_url, issue.key),
    }


def sprint_dict(sprint: Sprint) -> dict[str, Any]:
    return {
        "id": sprint.id,
        "board_id": sprint.board_id,
        "name": sprint.name,
        "state": sprint.state,
        "start": iso(sprint.start),
        "end": iso(sprint.end),
        "complete": iso(sprint.complete),
        "goal": sprint.goal,
    }


def window_dict(window: Window) -> dict[str, Any]:
    return {
        "index": window.index,
        "start": iso(window.start),
        "end": iso(window.end),
        "days": window.days,
        "business_days": window.business_days,
        "partial": window.partial,
    }


def _last_transition(evidence: Evidence) -> dict[str, Any] | None:
    if not evidence.last_transition_at:
        return None
    return {
        "at": iso(evidence.last_transition_at),
        "author": evidence.last_transition_author,
        "from": evidence.last_transition_from,
        "to": evidence.last_transition_to,
    }


def evidence_dict(evidence: Evidence) -> dict[str, Any]:
    """One piece of evidence for the wire: text in the ambient locale, plus ``code``, the message
    key, for a client that wants to tell the messages apart without reading them."""
    return {
        "rule": evidence.rule,
        "rule_description": render(evidence.description),
        "situation": evidence.situation.value,
        "label": render(evidence.situation.label),
        "message": render(evidence.msg),
        "code": evidence.msg.key,
        "days": evidence.days,
        "last_transition": _last_transition(evidence),
        "details": [render(d) for d in evidence.details],
    }


def evidence_record(evidence: Evidence) -> dict[str, Any]:
    """One piece of evidence for storage (``issue_snapshot.evidence``) and for the live side of a
    comparison, which must be measured like the stored one.

    ``msg``/``detail_msgs`` are the ``$msg`` records a reader renders in its own language;
    ``message``/``details`` are the pt-BR mirror older readers and ad-hoc SQL see (R4). The label
    and the rule description are not stored: the codes beside them say both."""
    return {
        "rule": evidence.rule,
        "situation": evidence.situation.value,
        "days": evidence.days,
        "last_transition": _last_transition(evidence),
        "msg": evidence.msg.to_json(),
        "detail_msgs": [d.to_json() for d in evidence.details],
        "message": render(evidence.msg, STORAGE_LOCALE),
        "details": [render(d, STORAGE_LOCALE) for d in evidence.details],
    }


def assessment_dict(assessment: RiskAssessment | None) -> dict[str, Any]:
    if assessment is None:
        situation = Situation.ON_TRACK
        return {"situation": situation.value, "label": render(situation.label), "severity": 0, "evidence": []}
    return {
        "situation": assessment.situation.value,
        "label": render(assessment.situation.label),
        "severity": assessment.situation.severity,
        "column": assessment.column,
        "stalled_checkpoints": assessment.stalled_checkpoints,
        "carried_sprints": assessment.carried_sprints,
        "wip_age_days": assessment.wip_age_days,
        "evidence": [evidence_dict(e) for e in assessment.evidence],
    }


def progress_dict(progress: Progress | None) -> dict[str, Any] | None:
    """``Progress.as_dict()`` with its coverage warning rendered."""
    return localize(progress.as_dict()) if progress is not None else None


def node_dict(
    node: TreeNode, assessments: Mapping[str, RiskAssessment], base_url: str | None = None
) -> dict[str, Any]:
    issue = node.issue
    return {
        "key": node.key,
        "label": render(node.label),
        "synthetic": node.synthetic,
        "missing": node.missing,
        "issue": issue_brief(issue, base_url) if issue else None,
        "risk": assessment_dict(assessments.get(node.key)) if issue else None,
        "progress": progress_dict(node.progress),
        "estimate_rollup": node.estimate_rollup,
        "children": [node_dict(c, assessments, base_url) for c in node.children],
    }
