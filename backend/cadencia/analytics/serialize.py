"""JSON-ready views of domain objects, shared by the API, exports and the CLI."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from cadencia.domain.calendar import Window
from cadencia.domain.hierarchy import TreeNode
from cadencia.domain.models import Issue, Sprint
from cadencia.domain.risk import Evidence, RiskAssessment, Situation


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


def evidence_dict(evidence: Evidence) -> dict[str, Any]:
    return {
        "rule": evidence.rule,
        "rule_description": evidence.description,
        "situation": evidence.situation.value,
        "label": evidence.situation.label,
        "message": evidence.message,
        "days": evidence.days,
        "last_transition": {
            "at": iso(evidence.last_transition_at),
            "author": evidence.last_transition_author,
            "from": evidence.last_transition_from,
            "to": evidence.last_transition_to,
        }
        if evidence.last_transition_at
        else None,
        "details": list(evidence.details),
    }


def assessment_dict(assessment: RiskAssessment | None) -> dict[str, Any]:
    if assessment is None:
        situation = Situation.ON_TRACK
        return {"situation": situation.value, "label": situation.label, "severity": 0, "evidence": []}
    return {
        "situation": assessment.situation.value,
        "label": assessment.situation.label,
        "severity": assessment.situation.severity,
        "column": assessment.column,
        "stalled_checkpoints": assessment.stalled_checkpoints,
        "carried_sprints": assessment.carried_sprints,
        "wip_age_days": assessment.wip_age_days,
        "evidence": [evidence_dict(e) for e in assessment.evidence],
    }


def node_dict(
    node: TreeNode, assessments: Mapping[str, RiskAssessment], base_url: str | None = None
) -> dict[str, Any]:
    issue = node.issue
    return {
        "key": node.key,
        "label": node.label,
        "synthetic": node.synthetic,
        "missing": node.missing,
        "issue": issue_brief(issue, base_url) if issue else None,
        "risk": assessment_dict(assessments.get(node.key)) if issue else None,
        "progress": node.progress.as_dict() if node.progress else None,
        "estimate_rollup": node.estimate_rollup,
        "children": [node_dict(c, assessments, base_url) for c in node.children],
    }
