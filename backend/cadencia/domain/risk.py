"""Risk classification with evidence (RF-15 … RF-19).

Six situations ordered by severity. Every rule is deterministic, configurable through the board
profile, and evaluated in the same order everywhere. An item gets the most severe situation that
fired; *all* fired rules are kept as evidence, because a classification must never be a black box.
Messages describe facts ("stalled for 9 days in Code Review"), never judge people. They are built
as ``Msg`` values and rendered at the boundary in the reader's language (the catalogue is the
``risk`` namespace); this module never renders text.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from itertools import pairwise
from zoneinfo import ZoneInfo

from cadencia.domain.history import IssueHistory
from cadencia.domain.models import BoardProfile, ChangeField, Sprint, StatusCategory
from cadencia.i18n.message import Msg


class Situation(StrEnum):
    ON_TRACK = "em_dia"
    AGING = "envelhecendo"
    STAGNANT = "estagnado"
    BLOCKED = "bloqueado"
    OVERDUE = "atrasado"
    CARRIED_OVER = "arrastado"

    @property
    def severity(self) -> int:
        return SEVERITY.index(self)

    @property
    def label(self) -> Msg:
        """The situation's name, as a message (``risk.situation.<value>``)."""
        return Msg(f"risk.situation.{self.value}")


SEVERITY = [
    Situation.ON_TRACK,
    Situation.AGING,
    Situation.STAGNANT,
    Situation.BLOCKED,
    Situation.OVERDUE,
    Situation.CARRIED_OVER,
]
#: The rules, in the order they are evaluated; each has ``risk.rule.<id>`` as its description.
RULES = ("arrasto", "prazo", "bloqueio", "estagnacao", "envelhecimento")


@dataclass(frozen=True)
class Evidence:
    rule: str
    situation: Situation
    msg: Msg
    last_transition_at: datetime | None = None
    last_transition_author: str | None = None
    last_transition_from: str | None = None
    last_transition_to: str | None = None
    days: float | None = None
    details: tuple[Msg, ...] = ()

    @property
    def description(self) -> Msg:
        """What the rule means, as a message (``risk.rule.<rule>``)."""
        return Msg(f"risk.rule.{self.rule}")


@dataclass(frozen=True)
class RiskAssessment:
    issue_key: str
    situation: Situation
    evidence: tuple[Evidence, ...]
    column: str | None
    stalled_checkpoints: int = 0
    carried_sprints: int = 0
    wip_age_days: float | None = None

    @property
    def at_risk(self) -> bool:
        return self.situation is not Situation.ON_TRACK


@dataclass(frozen=True)
class RiskContext:
    profile: BoardProfile
    as_of: datetime
    checkpoints: Sequence[datetime]  # board checkpoints ≤ as_of, ascending
    sprints: Mapping[int, Sprint] = field(default_factory=dict)
    aging_thresholds: Mapping[str, float] = field(default_factory=dict)  # type → days; "*" = all
    blocker_done: Callable[[str], bool | None] = lambda _key: None


def _days(delta: timedelta) -> float:
    return round(delta.total_seconds() / 86400, 1)


def _local_date(at: datetime, tz: str) -> str:
    """The instant's local date as ISO, for a message to format in the reader's convention."""
    return at.astimezone(ZoneInfo(tz)).date().isoformat()


def carried_sprints(history: IssueHistory, sprints: Mapping[int, Sprint], at: datetime) -> list[Sprint]:
    """Closed sprints the item was in, at their completion, without being done."""
    out = []
    for sprint_id in sorted(history.all_sprints()):
        sprint = sprints.get(sprint_id)
        if sprint is None or sprint.state != "closed":
            continue
        closed_at = sprint.complete or sprint.end
        if closed_at is None or closed_at > at:
            continue
        probe = closed_at - timedelta(seconds=1)
        if history.in_sprint_at(sprint_id, probe) and not history.is_done_at(probe):
            out.append(sprint)
    return out


def stalled_checkpoints(last_change: datetime, checkpoints: Sequence[datetime], at: datetime) -> int:
    """Full checkpoint-to-checkpoint intervals after the last status change."""
    return sum(1 for prev, cur in pairwise(checkpoints) if prev >= last_change and cur <= at)


def assess(history: IssueHistory, ctx: RiskContext) -> RiskAssessment:
    issue = history.issue
    at = ctx.as_of
    profile = ctx.profile
    status = history.status_at(at)
    if status is None:
        return RiskAssessment(issue.key, Situation.ON_TRACK, (), None)
    column = profile.column_of(status.id) or status.name
    carried = carried_sprints(history, ctx.sprints, at)
    if status.category is StatusCategory.DONE:
        return RiskAssessment(issue.key, Situation.ON_TRACK, (), column, carried_sprints=len(carried))

    evidence: list[Evidence] = []
    last = history.last_status_transition(at)
    last_change = last.at if last else issue.created
    last_fields = {
        "last_transition_at": last.at if last else None,
        "last_transition_author": last.author_name if last else None,
        "last_transition_from": last.from_value if last else None,
        "last_transition_to": last.to_value if last else None,
    }

    if carried:
        evidence.append(
            Evidence(
                "arrasto",
                Situation.CARRIED_OVER,
                Msg("risk.evidence.carried", count=len(carried), sprints=[s.name for s in carried]),
                **last_fields,
            )
        )

    local_today = at.astimezone(ZoneInfo(profile.timezone)).date()
    if issue.due_date and issue.due_date < local_today:
        late = (local_today - issue.due_date).days
        evidence.append(
            Evidence(
                "prazo",
                Situation.OVERDUE,
                Msg("risk.evidence.overdue", due=issue.due_date.isoformat(), late=late),
                days=float(late),
                **last_fields,
            )
        )

    reasons: list[Msg] = []
    if history.flagged_at(at):
        reasons.append(Msg("risk.reason.flagged"))
    if profile.is_blocked_status(status):
        reasons.append(Msg("risk.reason.status", status=status.name))
    open_blockers = [k for k in issue.blocked_by if ctx.blocker_done(k) is False]
    if open_blockers:
        reasons.append(Msg("risk.reason.waiting", keys=open_blockers))
    if reasons:
        evidence.append(
            Evidence(
                "bloqueio", Situation.BLOCKED, Msg("risk.evidence.blocked", reasons=reasons), **last_fields
            )
        )

    wip = profile.is_wip(status)
    stalled = stalled_checkpoints(last_change, ctx.checkpoints, at) if wip else 0
    if wip and stalled >= max(1, profile.stagnation_checkpoints):
        idle = at - last_change
        details: list[Msg] = []
        for t in history.transitions_between(last_change, at):
            if t.field is ChangeField.STATUS:
                continue
            when = _local_date(t.at, profile.timezone)
            if t.field is ChangeField.ASSIGNEE:
                details.append(Msg("risk.detail.assignee", before=t.from_value, after=t.to_value, when=when))
            elif t.field is ChangeField.ESTIMATE:
                details.append(Msg("risk.detail.estimate", before=t.from_value, after=t.to_value, when=when))
            elif t.field is ChangeField.SPRINT:
                details.append(Msg("risk.detail.sprint", after=t.to_value, when=when))
        evidence.append(
            Evidence(
                "estagnacao",
                Situation.STAGNANT,
                Msg("risk.evidence.stalled", days=int(_days(idle)), column=column, checkpoints=stalled),
                days=_days(idle),
                details=tuple(details),
                **last_fields,
            )
        )

    wip_age: float | None = None
    if wip:
        started = history.first_entry(profile.is_wip)
        if started is not None and started <= at:
            wip_age = _days(at - started)
            threshold = ctx.aging_thresholds.get(issue.type_name, ctx.aging_thresholds.get("*"))
            if threshold is not None and wip_age > threshold:
                evidence.append(
                    Evidence(
                        "envelhecimento",
                        Situation.AGING,
                        Msg(
                            "risk.evidence.aging",
                            age=wip_age,
                            percentile=profile.aging_percentile,
                            type_name=issue.type_name,
                            threshold=threshold,
                        ),
                        days=wip_age,
                        **last_fields,
                    )
                )

    evidence.sort(key=lambda e: e.situation.severity, reverse=True)
    situation = evidence[0].situation if evidence else Situation.ON_TRACK
    return RiskAssessment(
        issue_key=issue.key,
        situation=situation,
        evidence=tuple(evidence),
        column=column,
        stalled_checkpoints=stalled,
        carried_sprints=len(carried),
        wip_age_days=wip_age,
    )
