"""Flow metrics (RF-20 … RF-22, RF-33).

Cycle and lead time are always reported as P50/P85/P95 with the sample size; averages lie on the
long-tailed distributions software flow produces. Percentiles use the nearest-rank method, so
every reported value is a real observation ("85% dos itens terminaram em até N dias").
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from cadencia.domain.calendar import Window
from cadencia.domain.history import IssueHistory
from cadencia.domain.models import BoardProfile, StatusCategory

LOW_CONFIDENCE_SAMPLE = 5


def days(delta: timedelta | None) -> float | None:
    if delta is None:
        return None
    return round(delta.total_seconds() / 86400, 2)


def percentile(values: Sequence[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return ordered[rank - 1]


@dataclass(frozen=True)
class Distribution:
    n: int
    p50: float | None
    p85: float | None
    p95: float | None

    @property
    def low_confidence(self) -> bool:
        return self.n < LOW_CONFIDENCE_SAMPLE

    def as_dict(self) -> dict[str, object]:
        return {
            "n": self.n,
            "p50": self.p50,
            "p85": self.p85,
            "p95": self.p95,
            "low_confidence": self.low_confidence,
        }


def distribution(values: Iterable[float | None]) -> Distribution:
    sample = [v for v in values if v is not None]
    return Distribution(
        n=len(sample),
        p50=percentile(sample, 50),
        p85=percentile(sample, 85),
        p95=percentile(sample, 95),
    )


@dataclass(frozen=True)
class ItemMetrics:
    key: str
    type_name: str
    assignee_id: str | None
    assignee_name: str | None
    created: datetime
    started_at: datetime | None
    done_at: datetime | None
    lead_days: float | None
    cycle_days: float | None
    queue_days: float | None
    blocked_days: float
    active_days: float
    backward_moves: int
    reopened: bool

    @property
    def flow_efficiency(self) -> float | None:
        if self.done_at is None or not self.lead_days:
            return None
        return min(1.0, self.active_days / self.lead_days)


def item_metrics(history: IssueHistory, profile: BoardProfile, as_of: datetime) -> ItemMetrics:
    issue = history.issue
    done_at = history.done_at(as_of)
    started = history.first_entry(profile.is_wip)
    if started is not None and started > as_of:
        started = None
    end = done_at or as_of
    if started is not None and done_at is not None and started > done_at:
        started = None
    blocked = history.flagged_time(issue.created, end) + history.time_in(
        profile.is_blocked_status, issue.created, end
    )
    active = history.time_in(profile.is_active, issue.created, end) - history.flagged_time(issue.created, end)
    owner = history.assignee_at(end)
    return ItemMetrics(
        key=issue.key,
        type_name=issue.type_name,
        assignee_id=owner.account_id if owner else None,
        assignee_name=owner.display_name if owner else None,
        created=issue.created,
        started_at=started,
        done_at=done_at,
        lead_days=days(done_at - issue.created) if done_at else None,
        cycle_days=days(done_at - started) if done_at and started else None,
        queue_days=days((started or end) - issue.created),
        blocked_days=days(blocked) or 0.0,
        active_days=max(days(active) or 0.0, 0.0),
        backward_moves=history.backward_moves(profile.order_of, until=end),
        reopened=history.reopened(until=end),
    )


def completed_in(history: IssueHistory, start: datetime, end: datetime) -> bool:
    """Delivered in ``(start, end]``: not done at the start, done at the end (status category)."""
    return history.is_done_at(end) and not history.is_done_at(start)


def throughput(histories: Iterable[IssueHistory], windows: Sequence[Window]) -> list[int]:
    items = list(histories)
    return [sum(1 for h in items if completed_in(h, w.start, w.end)) for w in windows]


def sample_instants(start: datetime, end: datetime, step: timedelta = timedelta(days=1)) -> list[datetime]:
    out = []
    at = end
    while at > start:
        out.append(at)
        at -= step
    return sorted(out)


def wip_average(
    histories: Iterable[IssueHistory], profile: BoardProfile, start: datetime, end: datetime
) -> float | None:
    items = list(histories)
    instants = sample_instants(start, end)
    if not instants:
        return None
    counts = []
    for at in instants:
        counts.append(sum(1 for h in items if (s := h.status_at(at)) is not None and profile.is_wip(s)))
    return round(sum(counts) / len(counts), 2)


@dataclass(frozen=True)
class FlowSummary:
    completed: int
    lead: Distribution
    cycle: Distribution
    flow_efficiency: float | None
    reopen_rate: float | None
    backward_moves: int
    blocked_days: float
    work_mix: dict[str, int]

    def as_dict(self) -> dict[str, object]:
        return {
            "completed": self.completed,
            "lead_time": self.lead.as_dict(),
            "cycle_time": self.cycle.as_dict(),
            "flow_efficiency": self.flow_efficiency,
            "reopen_rate": self.reopen_rate,
            "backward_moves": self.backward_moves,
            "blocked_days": self.blocked_days,
            "work_mix": self.work_mix,
        }


def summarize(items: Sequence[ItemMetrics]) -> FlowSummary:
    done = [m for m in items if m.done_at is not None]
    lead_total = sum(m.lead_days or 0 for m in done)
    active_total = sum(min(m.active_days, m.lead_days or 0) for m in done)
    return FlowSummary(
        completed=len(done),
        lead=distribution(m.lead_days for m in done),
        cycle=distribution(m.cycle_days for m in done),
        flow_efficiency=round(active_total / lead_total, 3) if lead_total else None,
        reopen_rate=round(sum(m.reopened for m in done) / len(done), 3) if done else None,
        backward_moves=sum(m.backward_moves for m in items),
        blocked_days=round(sum(m.blocked_days for m in items), 2),
        work_mix=dict(sorted(Counter(m.type_name for m in done).items())),
    )


def aging_thresholds(
    completed: Sequence[ItemMetrics], pct: float = 85, min_sample: int = LOW_CONFIDENCE_SAMPLE
) -> dict[str, float]:
    """Per-type cycle-time percentile learned from history; "*" is the all-types fallback."""
    by_type: dict[str, list[float]] = defaultdict(list)
    for m in completed:
        if m.cycle_days is not None:
            by_type[m.type_name].append(m.cycle_days)
    out: dict[str, float] = {}
    for type_name, values in by_type.items():
        if len(values) >= min_sample:
            out[type_name] = percentile(values, pct) or 0.0
    everything = [v for values in by_type.values() for v in values]
    if len(everything) >= min_sample:
        out["*"] = percentile(everything, pct) or 0.0
    return out


def cumulative_flow(
    histories: Iterable[IssueHistory], profile: BoardProfile, start: datetime, end: datetime
) -> dict[str, object]:
    """Daily count of items per board column (RF-33, diagrama de fluxo cumulativo)."""
    items = list(histories)
    instants = sample_instants(start, end)
    if profile.columns:
        names = [c.name for c in profile.columns]
    else:
        names = ["A fazer", "Em andamento", "Concluído"]
    fallback = {
        StatusCategory.TODO: names[0],
        StatusCategory.IN_PROGRESS: names[len(names) // 2] if len(names) > 2 else names[-1],
        StatusCategory.DONE: names[-1],
    }
    series: dict[str, list[int]] = {n: [] for n in names}
    zone = ZoneInfo(profile.timezone)
    for at in instants:
        counts: Counter[str] = Counter()
        for h in items:
            status = h.status_at(at)
            if status is None:
                continue
            counts[profile.column_of(status.id) or fallback[status.category]] += 1
        for name in names:
            series[name].append(counts.get(name, 0))
    return {
        "dates": [at.astimezone(zone).date().isoformat() for at in instants],
        "columns": [{"name": n, "counts": series[n]} for n in names],
    }


def aging_wip(
    histories: Iterable[IssueHistory],
    profile: BoardProfile,
    as_of: datetime,
    thresholds: Mapping[str, float],
) -> list[dict[str, object]]:
    rows = []
    for h in histories:
        status = h.status_at(as_of)
        if status is None or not profile.is_wip(status):
            continue
        started = h.first_entry(profile.is_wip) or h.issue.created
        owner = h.assignee_at(as_of)
        rows.append(
            {
                "key": h.issue.key,
                "summary": h.issue.summary,
                "type": h.issue.type_name,
                "column": profile.column_of(status.id) or status.name,
                "age_days": days(as_of - started),
                "assignee": owner.display_name if owner else None,
                "threshold_days": thresholds.get(h.issue.type_name, thresholds.get("*")),
            }
        )
    rows.sort(key=lambda r: (-(r["age_days"] or 0), r["key"]))  # type: ignore[operator]
    return rows
