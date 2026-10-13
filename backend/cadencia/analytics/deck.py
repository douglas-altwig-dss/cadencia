"""Build the deck data (report context) from collected board data."""

from __future__ import annotations

import string
from collections import Counter, OrderedDict
from collections.abc import Callable, Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from cadencia.analytics.data import BoardData
from cadencia.domain.calendar import business_days, calendar_windows, sprint_timeline
from cadencia.domain.commitment import commitment_report
from cadencia.domain.compare import compare_window
from cadencia.domain.forecast import daily_throughput, monte_carlo
from cadencia.domain.hierarchy import progress_of
from cadencia.domain.history import IssueHistory
from cadencia.domain.metrics import distribution, item_metrics
from cadencia.domain.models import HierarchyLevel, Issue, Sprint
from cadencia.domain.risk import SEVERITY, RiskAssessment, Situation
from cadencia.report.core.context import (
    FIXED_PREFIX,
    BoardDeck,
    DeckData,
    Group,
    Row,
    RowGroup,
    Series,
    VariableSpec,
)

NO_EPIC = "Sem épico:"
NO_OWNER = "Sem responsável"
SPRINT_STATES = {"active": "Ativa", "closed": "Encerrada", "future": "Futura"}
HIGHLIGHTS = 5
MAX_DATE = date.max
# Share of added scope, and of the commitment missed, above which the light turns.
SCOPE_RISK, SCOPE_LATE = 0.2, 0.4
ADHERENCE_RISK, ADHERENCE_LATE = 0.2, 0.4


def _threshold(value: float, risk: float, late: float) -> str:
    """A ratio as a traffic light: the same three words the rest of the deck uses."""
    if value >= late:
        return "atrasado"
    return "risco" if value >= risk else "em_dia"


LATE = {Situation.OVERDUE, Situation.CARRIED_OVER}
AT_RISK = {Situation.BLOCKED, Situation.STAGNANT, Situation.AGING}

Alias = Callable[[str | None, str | None], str]


@dataclass(frozen=True)
class BoardInputs:
    """What a board's deck needs that only the store knows. The adapter computes it; the builder
    stays pure. Every field is optional: a missing input leaves its fields empty, not wrong."""

    #: `analytics.changes.compare` of the last checkpoint against now (#4).
    changes: Mapping[str, Any] | None = None
    changes_since: datetime | None = None
    #: `analytics.health.board_health` (#6).
    health: Mapping[str, Any] | None = None
    #: One summary per epic of the board's sprint that has a plan (#1), largest first.
    plans: Sequence[Mapping[str, Any]] = field(default_factory=tuple)


Inputs = Callable[[BoardData, datetime], BoardInputs]


def deck_status(history: IssueHistory, assessment: RiskAssessment | None, at: datetime) -> str:
    if history.is_done_at(at):
        return "concluido"
    if assessment is None:
        return "em_dia"
    if assessment.situation in LATE:
        return "atrasado"
    if assessment.situation in AT_RISK:
        return "risco"
    return "em_dia"


def _number(value: float | None, digits: int = 1) -> str:
    """A number as the deck shows it: no trailing ".0", comma as the decimal separator."""
    if value is None:
        return ""
    rounded = round(float(value), digits)
    text = f"{rounded:.{digits}f}".rstrip("0").rstrip(".") if digits else f"{int(rounded)}"
    return (text or "0").replace(".", ",")


def _local(value: datetime | None, tz: str, fmt: str) -> str:
    return value.astimezone(ZoneInfo(tz)).strftime(fmt) if value else ""


def _aliases(boards: Sequence[BoardData], enabled: bool) -> Alias:
    if not enabled:
        return lambda _account, name: name or ""
    accounts = sorted(
        {h.issue.assignee.account_id for b in boards for h in b.histories.values() if h.issue.assignee}
        | {
            t.author_id or ""
            for b in boards
            for h in b.histories.values()
            for t in h.transitions
            if t.field.value == "assignee"
        }
        | {
            t.to_id or ""
            for b in boards
            for h in b.histories.values()
            for t in h.transitions
            if t.field.value == "assignee"
        }
    )
    accounts = [a for a in accounts if a]
    letters = string.ascii_uppercase
    table = {}
    for index, account in enumerate(accounts):
        tag = letters[index % 26] * (index // 26 + 1)
        table[account] = f"Pessoa {tag}"
    return lambda account, name: table.get(account or "", "Pessoa") if account else (name or "")


def _epic_title(data: BoardData, issue: Issue) -> tuple[str, str]:
    parent = data.issues.get(issue.parent_key or "")
    while parent is not None and parent.hierarchy_level < HierarchyLevel.EPIC:
        parent = data.issues.get(parent.parent_key or "")
    if parent is None:
        return ("~", NO_EPIC)
    return (parent.rank or parent.key, f"{parent.summary}:")


def _group(
    data: BoardData, histories: Iterable[IssueHistory], text: Callable[[IssueHistory], str]
) -> list[Group]:
    buckets: OrderedDict[tuple[str, str], list[str]] = OrderedDict()
    for history in sorted(
        histories, key=lambda h: (_epic_title(data, h.issue), h.issue.rank or "~", h.issue.key)
    ):
        buckets.setdefault(_epic_title(data, history.issue), []).append(text(history))
    return [Group(title=title, items=items) for (_order, title), items in buckets.items()]


Variables = Callable[[str | None, int | None], dict[str, str]]


def _group_by(
    histories: Iterable[IssueHistory], key: Callable[[IssueHistory], str], text: Callable[[IssueHistory], str]
) -> list[Group]:
    """Group by any label (responsável, situação…), the buckets in alphabetical order."""
    buckets: dict[str, list[str]] = {}
    for history in histories:
        buckets.setdefault(key(history), []).append(text(history))
    return [Group(title=f"{title}:", items=items) for title, items in sorted(buckets.items())]


def board_deck(
    data: BoardData,
    reference: datetime,
    alias: Alias,
    *,
    committed: Callable[[int], Collection[str] | None] | None = None,
    variables: Mapping[str, str] | None = None,
    inputs: BoardInputs | None = None,
) -> BoardDeck:
    tz = data.profile.timezone
    inputs = inputs or BoardInputs()
    sprint = data.sprint_at(reference)
    deck = BoardDeck(
        board_id=data.board.id,
        name=data.board.name,
        space_key=data.board.space_key,
        space_name=data.board.space_name,
        sprint_id=sprint.id if sprint else None,
    )
    deck.texts["board.nome"] = data.board.name
    deck.texts["board.tipo"] = data.board.type
    deck.texts["espaco.nome"] = data.board.space_name or data.board.space_key or ""
    deck.texts["espaco.chave"] = data.board.space_key or ""
    # RF-45/RF-52: the variables land beside every other field, resolved for this board. A value
    # set on a single template slide overrides them later, when that slide is filled.
    for name, value in (variables or {}).items():
        deck.texts[f"{FIXED_PREFIX}{name}"] = value

    if sprint is not None:
        at = data.reference_for(sprint, reference)
        timeline = sprint_timeline(sprint, data.profile)
        windows = timeline.windows
        window = timeline.window_at(at) or timeline.current_window(at)
        scope = [
            h for h in data.sprint_members(sprint.id) if h.issue.hierarchy_level == HierarchyLevel.STANDARD
        ]
        members = [
            h for h in data.sprint_members(sprint.id, at) if h.issue.hierarchy_level < HierarchyLevel.EPIC
        ]
        deck.texts["sprint.nome"] = sprint.name
        deck.texts["sprint.periodo"] = (
            f"{_local(timeline.start, tz, '%d/%m')} – {_local(timeline.end, tz, '%d/%m')}"
        )
        deck.texts["sprint.objetivo"] = sprint.goal or ""
        deck.texts["sprint.estado"] = SPRINT_STATES.get(sprint.state, sprint.state)
        end = sprint.complete or sprint.end
        if end is not None:
            deck.numbers["sprint.dias_restantes"] = max(0.0, round((end - at).total_seconds() / 86400, 1))
        sprint_id: int | None = sprint.id
    else:
        at = reference
        windows = calendar_windows(data.profile, reference, 4)
        window = next((w for w in reversed(windows) if w.start < at), None)
        scope = data.work_items()
        members = data.open_items(at)
        sprint_id = None

    if window is not None:
        deck.numbers["janela.indice"] = float(window.index)
        deck.numbers["janela.total"] = float(len(windows))
        deck.texts["janela.numero"] = f"{window.index} de {len(windows)}"
        deck.texts["janela.periodo"] = (
            f"{_local(window.start, tz, '%d/%m')} – {_local(min(window.end, at), tz, '%d/%m')}"
        )
        diff = compare_window(scope, window.start, min(window.end, at), sprint_id)
        completed_keys = set(diff.completed)
    else:
        completed_keys = set()

    work = [h for h in members if h.issue.hierarchy_level == HierarchyLevel.STANDARD]
    assessments = data.assess(members, at)
    completed = [data.histories[k] for k in completed_keys if k in data.histories]
    completed_work = [h for h in completed if h.issue.hierarchy_level == HierarchyLevel.STANDARD] or completed
    open_work = [h for h in work if not h.is_done_at(at)]
    at_risk = [h for h in members if assessments[h.issue.key].at_risk]
    at_risk.sort(key=lambda h: (-assessments[h.issue.key].situation.severity, h.issue.key))

    def message(history: IssueHistory) -> str:
        evidence = assessments[history.issue.key].evidence
        return evidence[0].message if evidence else ""

    def owner_name(history: IssueHistory) -> str:
        person = history.assignee_at(at)
        return alias(person.account_id, person.display_name) if person else NO_OWNER

    def situation_name(history: IssueHistory) -> str:
        return assessments[history.issue.key].situation.label

    blocked = [h for h in members if any(e.rule == "bloqueio" for e in assessments[h.issue.key].evidence)]

    deck.groups["entregas.por_epico"] = _group(data, completed_work, lambda h: h.issue.summary)
    deck.groups["proximas.por_epico"] = _group(data, open_work, lambda h: h.issue.summary)
    deck.groups["riscos.por_epico"] = _group(data, at_risk, lambda h: f"{h.issue.summary} — {message(h)}")
    deck.groups["bloqueios.por_epico"] = _group(data, blocked, lambda h: f"{h.issue.summary} — {message(h)}")
    deck.groups["entregas.por_responsavel"] = _group_by(completed_work, owner_name, lambda h: h.issue.summary)
    deck.groups["proximas.por_responsavel"] = _group_by(open_work, owner_name, lambda h: h.issue.summary)
    deck.groups["riscos.por_situacao"] = _group_by(
        at_risk, situation_name, lambda h: f"{h.issue.summary} — {message(h)}"
    )
    # Highlights: the biggest deliveries of the window, largest estimate first, then by key.
    highlights = sorted(completed_work, key=lambda h: (-(h.issue.estimate or 0), h.issue.key))[:HIGHLIGHTS]
    deck.groups["conquistas.destaques"] = (
        [Group("Destaques da semana:", [h.issue.summary for h in highlights])] if highlights else []
    )

    deadlines = []
    epics: dict[str, list[IssueHistory]] = {}
    for history in work:
        parent = data.issues.get(history.issue.parent_key or "")
        if parent is not None and parent.hierarchy_level >= HierarchyLevel.EPIC and parent.due_date:
            epics.setdefault(parent.key, []).append(history)
    for key, children in sorted(epics.items(), key=lambda kv: (data.issues[kv[0]].due_date, kv[0])):
        epic = data.issues[key]
        still_open = sum(1 for h in children if not h.is_done_at(at))
        items = [f"Data limite {epic.due_date:%d/%m/%y}"]
        if still_open:
            items.append(f"{still_open} item(ns) em aberto nesta sprint")
        deadlines.append(Group(f"{epic.summary}:", items))
    deck.groups["prazos.por_epico"] = deadlines

    sprint_label = sprint.name if sprint else ""

    def row(history: IssueHistory) -> Row:
        owner = history.assignee_at(at)
        issue = history.issue
        status = deck_status(history, assessments.get(issue.key), at)
        due = issue.due_date
        still_days = (at - history.last_status_change_at(at)).total_seconds() / 86400
        metrics = item_metrics(history, data.profile, at)
        estimate = history.estimate_at(at)
        return Row(
            values={
                "sprint": sprint_label,
                "chave": issue.key,
                "resumo": issue.summary,
                "responsavel": alias(
                    owner.account_id if owner else None, owner.display_name if owner else None
                ),
                "acao": message(history) if issue.key in assessments else "",
                "prazo": f"{due:%d/%m}" if due else "",
                "situacao": status,
                "epico": _epic_title(data, issue)[1].rstrip(":"),
                "tipo": issue.type_name,
                "estimativa": _number(estimate),
                "status": (history.status_at(at) or issue.status).name,
                "dias_parado": _number(still_days, 0),
                "cycle_time": _number(metrics.cycle_days, 1),
            },
            status=status,
        )

    deck.rows["riscos.bloqueios"] = [row(h) for h in blocked]
    deck.rows["riscos.itens"] = [row(h) for h in at_risk]
    deck.rows["entregas.itens"] = [row(h) for h in completed_work]
    deck.rows["proximas.itens"] = [row(h) for h in open_work]
    deck.rows["prazos.itens"] = [
        row(h)
        for h in sorted(members, key=lambda h: (h.issue.due_date or MAX_DATE, h.issue.key))
        if h.issue.due_date is not None
    ]
    deck.rows["sprint.itens"] = [row(h) for h in members]

    tracked = [
        h
        for h in work
        if h.issue.key in completed_keys or assessments[h.issue.key].at_risk or h.issue.due_date is not None
    ]
    groups: OrderedDict[tuple[str, str], list[Row]] = OrderedDict()
    for history in sorted(
        tracked, key=lambda h: (_epic_title(data, h.issue), h.issue.rank or "~", h.issue.key)
    ):
        groups.setdefault(_epic_title(data, history.issue), []).append(row(history))
    deck.row_groups["acompanhamento.por_epico"] = [
        RowGroup(title=title.rstrip(":"), rows=rows) for (_o, title), rows in groups.items()
    ]

    def row_groups_by(
        histories: Sequence[IssueHistory], key: Callable[[IssueHistory], str]
    ) -> list[RowGroup]:
        buckets: dict[str, list[Row]] = {}
        for history in histories:
            buckets.setdefault(key(history), []).append(row(history))
        return [RowGroup(title=title, rows=rows) for title, rows in sorted(buckets.items())]

    deck.row_groups["acompanhamento.por_responsavel"] = row_groups_by(work, owner_name)
    deck.row_groups["acompanhamento.por_situacao"] = row_groups_by(members, situation_name)

    categories = [deck_status(h, assessments.get(h.issue.key), at) for h in work]
    if "atrasado" in categories:
        overall = "atrasado"
    elif "risco" in categories:
        overall = "risco"
    else:
        overall = "em_dia"
    deck.statuses["board.status_geral"] = overall
    overdue = any(e.rule == "prazo" for h in work for e in assessments[h.issue.key].evidence)
    soon = any(
        h.issue.due_date and not h.is_done_at(at) and h.issue.due_date <= (at + timedelta(days=7)).date()
        for h in work
    )
    deck.statuses["board.status_prazo"] = "atrasado" if overdue else ("risco" if soon else "em_dia")
    blocking = any(
        assessments[h.issue.key].situation in {Situation.BLOCKED, Situation.STAGNANT} for h in members
    )
    deck.statuses["board.status_riscos"] = "risco" if blocking else "em_dia"

    report = None
    history_sprints: list[Sprint] = []
    evolution: list[Any] = []
    if sprint is not None:
        report = commitment_report(scope, sprint, at, committed(sprint.id) if committed else None)
        carried = sum(1 for h in members if assessments[h.issue.key].carried_sprints and not h.is_done_at(at))
        deck.texts["resumo.comprometidos"] = str(report.board.committed)
        deck.texts["resumo.aderencia"] = (
            f"{round(report.board.adherence * 100)}%" if report.board.adherence is not None else "—"
        )
        deck.texts["resumo.escopo_adicionado"] = str(report.board.added)
        deck.texts["resumo.arrastados"] = str(carried)
        deck.numbers.update(
            {
                "num.comprometidos": float(report.board.committed),
                "num.restantes": float(report.board.remaining),
                "num.removidos": float(report.board.removed),
                "num.escopo_adicionado": float(report.board.added),
                "num.arrastados": float(carried),
                "num.aderencia": round(report.board.adherence, 3)
                if report.board.adherence is not None
                else 0.0,
            }
        )
        committed_count = report.board.committed
        deck.statuses["board.status_escopo"] = _threshold(
            report.board.added / committed_count if committed_count else 0.0, SCOPE_RISK, SCOPE_LATE
        )
        if report.board.adherence is not None:
            deck.statuses["board.status_aderencia"] = _threshold(
                1 - report.board.adherence, ADHERENCE_RISK, ADHERENCE_LATE
            )
    deck.texts["resumo.entregues"] = str(len(completed_work))
    deck.texts["resumo.em_risco"] = str(len(at_risk))

    people = sorted({owner_name(h) for h in members} - {NO_OWNER}, key=str.casefold)
    deck.texts["board.pessoas"] = ", ".join(people)
    deck.numbers["board.total_pessoas"] = float(len(people))

    done_metrics = [item_metrics(h, data.profile, at) for h in work if h.is_done_at(at)]
    cycle = distribution(m.cycle_days for m in done_metrics)
    lead = distribution(m.lead_days for m in done_metrics)
    progress = progress_of([h.issue for h in work], is_done=lambda i: data.histories[i.key].is_done_at(at))
    deck.numbers.update(
        {
            "num.entregues": float(len(completed_work)),
            "num.entregues_sprint": float(progress.done),
            "num.em_risco": float(len(at_risk)),
            "num.bloqueados": float(len(blocked)),
            "num.atrasados": float(sum(1 for h in members if assessments[h.issue.key].situation in LATE)),
            "num.abertos": float(len(open_work)),
            "num.sem_responsavel": float(sum(1 for h in open_work if owner_name(h) == NO_OWNER)),
            "num.progresso": round(progress.done / progress.total, 3) if progress.total else 0.0,
            "num.wip": float(
                sum(1 for h in members if data.profile.is_wip(h.status_at(at) or h.issue.status))
            ),
            "num.vazao_janela": float(len(completed_keys)),
        }
    )
    percentiles = (("num.cycle_p50", cycle.p50), ("num.cycle_p85", cycle.p85), ("num.lead_p50", lead.p50))
    for key, value in percentiles:
        deck.numbers[key] = float(value) if value is not None else 0.0

    counts_by_window = []
    for w in windows:
        if w.start >= at:
            break
        counts_by_window.append(len(compare_window(scope, w.start, min(w.end, at), sprint_id).completed))
    deck.series["grafico.vazao"] = Series(
        categories=[f"Semana {w.index}" for w in windows[: len(counts_by_window)]],
        series={"Entregues": [float(c) for c in counts_by_window]},
    )
    if sprint is not None:
        history_sprints = data.closed_sprints(at, 5)
        if sprint not in history_sprints:
            history_sprints.append(sprint)
        evolution = [
            commitment_report(data.sprint_members(s.id), s, at, committed(s.id) if committed else None)
            for s in history_sprints
        ]
        deck.series["grafico.evolucao"] = Series(
            categories=[s.name for s in history_sprints],
            series={
                "Comprometido": [float(r.board.committed) for r in evolution],
                "Entregue": [float(r.board.delivered) for r in evolution],
                "Escopo adicionado": [float(r.board.added) for r in evolution],
            },
        )
    tally = Counter(assessments[h.issue.key].situation for h in members if not h.is_done_at(at))
    deck.series["grafico.riscos"] = Series(
        categories=[s.label for s in SEVERITY],
        series={"Itens": [float(tally.get(s, 0)) for s in SEVERITY]},
    )
    # Burndown from the same windows as the throughput chart, so the two line up week by week.
    closed_windows = windows[: len(counts_by_window)]
    deck.series["grafico.burndown"] = Series(
        categories=[f"Semana {w.index}" for w in closed_windows],
        series={
            "Em aberto": [
                float(sum(1 for h in scope if not h.is_done_at(min(w.end, at)))) for w in closed_windows
            ]
        },
    )
    per_person = Counter(owner_name(h) for h in completed_work)
    deck.series["grafico.por_responsavel"] = Series(
        categories=sorted(per_person, key=str.casefold),
        series={"Entregues": [float(per_person[name]) for name in sorted(per_person, key=str.casefold)]},
    )
    per_type = Counter(h.issue.type_name for h in members)
    deck.series["grafico.por_tipo"] = Series(
        categories=sorted(per_type),
        series={"Itens": [float(per_type[name]) for name in sorted(per_type)]},
    )
    doing = sum(
        1 for h in work if data.profile.is_wip(h.status_at(at) or h.issue.status) and not h.is_done_at(at)
    )
    deck.series["grafico.progresso"] = Series(
        categories=["Concluído", "Em andamento", "A fazer"],
        series={
            "Itens": [
                float(progress.done),
                float(doing),
                float(max(progress.total - progress.done - doing, 0)),
            ]
        },
    )
    _forecast_fields(deck, data, sprint, at, open_work)
    _flow_fields(deck, data, sprint, scope, at, cycle.p85)
    previous_sprint = (
        evolution[-2] if sprint is not None and len(evolution) > 1 and history_sprints[-1] == sprint else None
    )
    deck.numbers["num.vazao_janela_delta"] = (
        float(counts_by_window[-1] - counts_by_window[-2]) if len(counts_by_window) > 1 else 0.0
    )
    if report is not None and previous_sprint is not None:
        deck.numbers["num.entregues_sprint_delta"] = float(
            report.board.delivered - previous_sprint.board.delivered
        )
        if report.board.adherence is not None and previous_sprint.board.adherence is not None:
            deck.numbers["num.aderencia_delta"] = round(
                report.board.adherence - previous_sprint.board.adherence, 3
            )
    _change_fields(deck, data, inputs, alias, at, len(at_risk))
    deck.texts["tendencia.vazao"] = _trend(
        _number(deck.numbers.get("num.vazao_janela")), deck.numbers.get("num.vazao_janela_delta")
    )
    if "num.aderencia_delta" in deck.numbers:
        deck.texts["tendencia.aderencia"] = _trend(
            deck.texts.get("resumo.aderencia", ""), round(deck.numbers["num.aderencia_delta"] * 100), " p.p."
        )
    if "num.em_risco_delta" in deck.numbers:
        deck.texts["tendencia.em_risco"] = _trend(str(len(at_risk)), deck.numbers["num.em_risco_delta"])
    _health_fields(deck, inputs)
    _plan_fields(deck, inputs)
    return deck


def _trend(value: str, delta: float | None, unit: str = "") -> str:
    """``5 ↑2``: the value, then which way it moved against the previous period and by how much."""
    if not value:
        return ""
    if delta is None or delta == 0:
        return f"{value} ="
    arrow = "↑" if delta > 0 else "↓"
    return f"{value} {arrow}{_number(abs(delta))}{unit}"


def _forecast_fields(
    deck: BoardDeck, data: BoardData, sprint: Sprint | None, at: datetime, open_work: Sequence[IssueHistory]
) -> None:
    """#2: the Monte Carlo answer (RF-72) for what is still open, at the board's own pace."""
    tz = data.profile.timezone
    horizon = None
    if sprint is not None:
        timeline = sprint_timeline(sprint, data.profile)
        if timeline.end is not None and timeline.end > at:
            horizon = business_days(at, timeline.end, tz=tz, holidays=data.profile.holidays)
    samples = daily_throughput(data.work_items(), at, tz=tz, holidays=data.profile.holidays)
    result = monte_carlo(
        samples,
        len(open_work),
        at.astimezone(ZoneInfo(tz)).date(),
        horizon_days=horizon,
        holidays=data.profile.holidays,
    )
    if result.p50_date is not None:
        deck.texts["previsao.p50_data"] = f"{result.p50_date:%d/%m/%Y}"
    if result.p85_date is not None:
        deck.texts["previsao.p85_data"] = f"{result.p85_date:%d/%m/%Y}"
    for key, value in (
        ("num.previsao_p50_dias", result.p50_days),
        ("num.previsao_p85_dias", result.p85_days),
    ):
        if value is not None:
            deck.numbers[key] = float(value)
    if result.probability is not None:
        deck.numbers["num.previsao_chance_sprint"] = round(result.probability, 3)
        deck.texts["previsao.chance_sprint"] = f"{round(result.probability * 100)}%"
    days = [result.p50_days, result.p85_days, result.p95_days]
    if all(d is not None for d in days):
        deck.series["grafico.previsao"] = Series(
            categories=["50% de chance", "85% de chance", "95% de chance"],
            series={"Dias úteis": [float(d) for d in days if d is not None]},
            y_label="dias úteis",
        )


def _flow_fields(
    deck: BoardDeck,
    data: BoardData,
    sprint: Sprint | None,
    scope: Sequence[IssueHistory],
    at: datetime,
    cycle_p85: float | None,
) -> None:
    """#3: cumulative flow per column, day by day, and the age of what is in progress."""
    columns = data.profile.columns
    if not columns:
        return
    zone = ZoneInfo(data.profile.timezone)
    first = sprint.start if sprint is not None and sprint.start is not None else at - timedelta(days=28)
    day = first.astimezone(zone).date()
    last = at.astimezone(zone).date()
    work = [h for h in scope if h.issue.hierarchy_level == HierarchyLevel.STANDARD]
    categories: list[str] = []
    counts: list[list[float]] = [[] for _ in columns]
    while day <= last:
        if day.weekday() < 5 and day not in data.profile.holidays:
            moment = min(datetime.combine(day, time(23, 59), zone), at)
            tally = [0.0] * len(columns)
            for history in work:
                status = history.status_at(moment)
                if status is None:
                    continue
                index = data.profile.column_index(status.id)
                if index is not None:
                    tally[index] += 1
            categories.append(f"{day:%d/%m}")
            for index, value in enumerate(tally):
                counts[index].append(value)
        day += timedelta(days=1)
    if categories:
        # Bottom band first: the last column (done) grows upward, the way a CFD is read.
        ordered = list(reversed(list(zip((c.name for c in columns), counts, strict=True))))
        deck.series["grafico.cfd"] = Series(
            categories=categories,
            series={name: values for name, values in ordered},
            style="stacked_area",
            y_label="itens",
        )
    wip = [
        (history, data.profile.column_index((history.status_at(at) or history.issue.status).id))
        for history in work
        if not history.is_done_at(at) and data.profile.is_wip(history.status_at(at) or history.issue.status)
    ]
    placed = [(h, i) for h, i in wip if i is not None]
    if placed:
        used = sorted({i for _, i in placed})
        position = {column: n for n, column in enumerate(used)}
        marks = []
        for history, index in placed:
            started = item_metrics(history, data.profile, at).started_at or history.issue.created
            age = max((at - started).total_seconds() / 86400, 0.0)
            marks.append({"x": position[index], "y": round(age, 1), "label": history.issue.key})
        deck.series["grafico.aging"] = Series(
            categories=[columns[i].name for i in used],
            series={"P85 histórico de cycle time": [float(cycle_p85)]} if cycle_p85 else {},
            style="scatter",
            marks=marks,
            y_label="dias em andamento",
        )


def _change_fields(
    deck: BoardDeck, data: BoardData, inputs: BoardInputs, alias: Alias, at: datetime, at_risk: int
) -> None:
    """#4: what moved since the last checkpoint, read through `analytics.changes.compare`."""
    changes = inputs.changes
    if not changes:
        return
    tz = data.profile.timezone
    if inputs.changes_since is not None:
        deck.texts["mudancas.periodo"] = f"desde {_local(inputs.changes_since, tz, '%d/%m %H:%M')}"
    labels = {s.value: s.label for s in SEVERITY}

    def rows(entries: Sequence[Mapping[str, Any]], before: str, after: str) -> list[Row]:
        out = []
        for entry in entries:
            history = data.histories.get(entry["key"])
            owner = history.assignee_at(at) if history else None
            out.append(
                Row(
                    values={
                        "chave": entry["key"],
                        "resumo": history.issue.summary if history else entry["key"],
                        "responsavel": alias(owner.account_id, owner.display_name) if owner else NO_OWNER,
                        "de": labels.get(str(entry.get(before) or ""), str(entry.get(before) or "")),
                        "para": labels.get(str(entry.get(after) or ""), str(entry.get(after) or "")),
                        "motivo": entry.get("reason") or "",
                    }
                )
            )
        return out

    deck.rows["mudancas.novos_riscos"] = rows(changes.get("new_risks", []), "from", "situation")
    deck.rows["mudancas.resolvidos"] = rows(changes.get("resolved", []), "from", "situation")
    deck.rows["mudancas.concluidos"] = rows(changes.get("completed", []), "", "status")
    deck.rows["mudancas.entraram"] = rows(changes.get("entered", []), "", "status")
    summary = []
    for title, key in (
        ("Ficaram em risco", "mudancas.novos_riscos"),
        ("Riscos resolvidos", "mudancas.resolvidos"),
        ("Concluídos", "mudancas.concluidos"),
        ("Entraram no escopo", "mudancas.entraram"),
    ):
        items = [f"{r.values['chave']} {r.values['resumo']}" for r in deck.rows[key]]
        if items:
            summary.append(Group(f"{title}:", items))
    deck.groups["mudancas.resumo"] = summary
    deck.numbers["num.mudancas_novos_riscos"] = float(len(deck.rows["mudancas.novos_riscos"]))
    deck.numbers["num.mudancas_resolvidos"] = float(len(deck.rows["mudancas.resolvidos"]))
    deck.numbers["num.mudancas_concluidos"] = float(len(deck.rows["mudancas.concluidos"]))
    before = changes.get("before", {}).get("situations", {})
    was_at_risk = sum(n for situation, n in before.items() if situation != Situation.ON_TRACK.value)
    deck.numbers["num.em_risco_delta"] = float(at_risk - was_at_risk)


def _health_fields(deck: BoardDeck, inputs: BoardInputs) -> None:
    """#6: the Jira hygiene problems (RF-78) as an appendix a template can show or hide."""
    if inputs.health is None:
        return
    checks = list(inputs.health.get("checks", []))
    deck.rows["saude.problemas"] = [
        Row(
            values={
                "problema": check["title"],
                "gravidade": check["severity"],
                "quantidade": str(check["count"]),
                "exemplos": ", ".join(check.get("examples", [])),
                "acao": check.get("action", ""),
            },
            status="atrasado"
            if check["severity"] == "erro"
            else "risco"
            if check["severity"] == "aviso"
            else None,
        )
        for check in checks
    ]
    deck.numbers["num.saude_problemas"] = float(len(checks))
    severities = {c["severity"] for c in checks}
    deck.statuses["board.status_dados"] = (
        "atrasado" if "erro" in severities else "risco" if "aviso" in severities else "em_dia"
    )


def _plan_fields(deck: BoardDeck, inputs: BoardInputs) -> None:
    """#1: the epic plans of the epics this board is working on (see `analytics.epic_plan.deck_summary`)."""
    plans = list(inputs.plans)
    if not plans:
        return
    deck.rows["plano.epicos"] = [
        Row(
            values={
                "chave": p["key"],
                "epico": p["title"],
                "horas": _number(p["hours"]),
                "base_dias": str(p["base_days"]) if p.get("base_days") is not None else "—",
                "plano_dias": str(p["plan_days"]) if p.get("plan_days") is not None else "—",
                "ganho": str(p["gain_days"]) if p.get("gain_days") is not None else "—",
                "algoritmo": p.get("algorithm") or "",
                "situacao_plano": p.get("state", ""),
            },
            status="em_dia" if p.get("plan_days") is not None else "risco",
        )
        for p in plans
    ]
    main = next((p for p in plans if p.get("plan_days") is not None), None)
    if main is None:
        return
    deck.texts["plano.epico"] = f"{main['key']} {main['title']}"
    deck.texts["plano.duracao"] = main.get("duration_label", "")
    deck.numbers["num.plano_dias"] = float(main["plan_days"])
    deck.numbers["num.plano_horas"] = float(main["hours"])
    if main.get("base_days") is not None:
        deck.numbers["num.plano_base_dias"] = float(main["base_days"])
    if main.get("gain_days") is not None:
        deck.numbers["num.plano_ganho_dias"] = float(main["gain_days"])
    if main.get("lanes"):
        deck.series["grafico.gantt"] = Series(
            categories=list(main["lanes"]),
            series={"jornada": [float(main.get("workday", 6.0))]},
            style="gantt",
            marks=list(main.get("bars", [])),
        )
    if main.get("role_hours"):
        roles = main["role_hours"]
        deck.series["grafico.horas_por_papel"] = Series(
            categories=[r["name"] for r in roles],
            series={"Horas-pessoa": [float(r["hours"]) for r in roles]},
            y_label="horas",
        )


def deck_data(
    boards: Sequence[BoardData],
    reference: datetime,
    *,
    now: datetime,
    anonymize: bool = False,
    committed: Callable[[int], Collection[str] | None] | None = None,
    variables: Variables | None = None,
    slide_variables: Mapping[int, Mapping[str, str]] | None = None,
    registry: Mapping[str, VariableSpec] | None = None,
    template_name: str = "",
    inputs: Inputs | None = None,
) -> DeckData:
    """The whole report context.

    ``variables`` answers, per board, what the variables say — which is how the same placeholder
    becomes Space A's or Space B's words. ``slide_variables`` carries the values set on one
    template slide; they are applied when that slide is filled, and beat everything else.

    ``registry`` is the registered variables, and it is what makes a name exist at all: a
    ``{{texto.x}}`` outside it is refused rather than rendered blank. Leaving it out means *nothing
    is registered*, so every variable is refused — which is the right answer for a caller that has
    no registry, and never the old "assume it exists and print nothing".
    """
    alias = _aliases(boards, anonymize)
    tz = boards[0].profile.timezone if boards else "America/Sao_Paulo"
    deck = DeckData(reference=reference)
    deck.texts["relatorio.data"] = _local(now, tz, "%d/%m/%Y")
    deck.texts["relatorio.semana"] = _local(reference, tz, "%d/%m/%Y")
    deck.texts["relatorio.periodo"] = (
        f"{_local(reference - timedelta(days=7), tz, '%d/%m')} – {_local(reference, tz, '%d/%m')}"
    )
    deck.boards = [
        board_deck(
            b,
            reference,
            alias,
            committed=committed,
            variables=variables(b.board.space_key, b.board.id) if variables else None,
            inputs=inputs(b, reference) if inputs else None,
        )
        for b in boards
    ]
    deck.slide_texts = {int(k): dict(v) for k, v in (slide_variables or {}).items()}
    deck.variables = dict(registry or {})
    deck.template_name = template_name
    # Deck-level slides have no board, so they get the variables resolved with no board and no
    # space: the global value, or the registration's default. Nothing narrower reaches them.
    for name, value in (variables(None, None) if variables else {}).items():
        deck.texts[f"{FIXED_PREFIX}{name}"] = value
    deck.texts["relatorio.boards"] = ", ".join(b.name for b in deck.boards)
    spaces = sorted({b.space_name or b.space_key or "" for b in deck.boards} - {""}, key=str.casefold)
    deck.texts["relatorio.espacos"] = ", ".join(spaces)
    deck.numbers["relatorio.total_boards"] = float(len(deck.boards))
    for key, source in (
        ("relatorio.total_entregues", "num.entregues"),
        ("relatorio.total_em_risco", "num.em_risco"),
        ("relatorio.total_atrasados", "num.atrasados"),
    ):
        deck.numbers[key] = float(sum(b.numbers.get(source, 0.0) for b in deck.boards))
    return deck
