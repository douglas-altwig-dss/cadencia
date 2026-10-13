"""Risk classification with evidence (RF-15 … RF-19).

Six situations ordered by severity. Every rule is deterministic, configurable through the board
profile, and evaluated in the same order everywhere. An item gets the most severe situation that
fired; *all* fired rules are kept as evidence, because a classification must never be a black box.
Messages describe facts ("parado há 9 dias em Code Review"), never judge people.
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
    def label(self) -> str:
        return LABELS[self]


SEVERITY = [
    Situation.ON_TRACK,
    Situation.AGING,
    Situation.STAGNANT,
    Situation.BLOCKED,
    Situation.OVERDUE,
    Situation.CARRIED_OVER,
]
LABELS = {
    Situation.ON_TRACK: "Em dia",
    Situation.AGING: "Envelhecendo",
    Situation.STAGNANT: "Estagnado",
    Situation.BLOCKED: "Bloqueado",
    Situation.OVERDUE: "Atrasado",
    Situation.CARRIED_OVER: "Arrastado",
}
RULES = {
    "arrasto": "Participou de sprints encerradas sem ser concluído.",
    "prazo": "Data limite (duedate) anterior à data de referência e item não concluído.",
    "bloqueio": "Sinalizado como impedimento, em status de bloqueio ou com bloqueador aberto.",
    "estagnacao": "Em coluna de andamento sem nenhuma transição de status entre checkpoints consecutivos.",
    "envelhecimento": "Tempo em andamento acima do percentil histórico do mesmo tipo e board.",
}


@dataclass(frozen=True)
class Evidence:
    rule: str
    situation: Situation
    message: str
    last_transition_at: datetime | None = None
    last_transition_author: str | None = None
    last_transition_from: str | None = None
    last_transition_to: str | None = None
    days: float | None = None
    details: tuple[str, ...] = ()

    @property
    def description(self) -> str:
        return RULES[self.rule]


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


def _fmt(at: datetime, tz: str) -> str:
    return at.astimezone(ZoneInfo(tz)).strftime("%d/%m")


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
        names = ", ".join(s.name for s in carried)
        plural = "sprint encerrada" if len(carried) == 1 else "sprints encerradas"
        evidence.append(
            Evidence(
                "arrasto",
                Situation.CARRIED_OVER,
                f"passou por {len(carried)} {plural} sem conclusão ({names})",
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
                f"data limite {issue.due_date:%d/%m} vencida há {late} dia{'s' if late != 1 else ''}",
                days=float(late),
                **last_fields,
            )
        )

    reasons = []
    if history.flagged_at(at):
        reasons.append("sinalizado como impedimento no Jira")
    if profile.is_blocked_status(status):
        reasons.append(f"no status {status.name}")
    open_blockers = [k for k in issue.blocked_by if ctx.blocker_done(k) is False]
    if open_blockers:
        reasons.append("aguardando " + ", ".join(open_blockers))
    if reasons:
        evidence.append(Evidence("bloqueio", Situation.BLOCKED, "; ".join(reasons), **last_fields))

    wip = profile.is_wip(status)
    stalled = stalled_checkpoints(last_change, ctx.checkpoints, at) if wip else 0
    if wip and stalled >= max(1, profile.stagnation_checkpoints):
        idle = at - last_change
        details = []
        for t in history.transitions_between(last_change, at):
            if t.field is ChangeField.STATUS:
                continue
            when = _fmt(t.at, profile.timezone)
            if t.field is ChangeField.ASSIGNEE:
                details.append(
                    f"responsável mudou de {t.from_value or 'ninguém'} para "
                    f"{t.to_value or 'ninguém'} em {when}, sem mudança de status"
                )
            elif t.field is ChangeField.ESTIMATE:
                details.append(
                    f"estimativa mudou de {t.from_value or '—'} para {t.to_value or '—'} em {when}"
                )
            elif t.field is ChangeField.SPRINT:
                details.append(f"sprint mudou para {t.to_value or '—'} em {when}")
        suffix = f" ({stalled} checkpoints sem transição)" if stalled > 1 else ""
        evidence.append(
            Evidence(
                "estagnacao",
                Situation.STAGNANT,
                f"parado há {int(_days(idle))} dias em {column}{suffix}",
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
                        f"em andamento há {wip_age:g} dias; P{profile.aging_percentile:g} "
                        f"histórico de {issue.type_name}: {threshold:g} dias",
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
