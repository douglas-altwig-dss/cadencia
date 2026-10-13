"""Greedy theoretical allocation and its comparison with reality (RF-26, RF-27, RF-29).

A heuristic baseline, not the truth: it ignores tacit knowledge, pairing, mentoring and the fact
that the fastest person on a topic is usually the most interrupted one. The UI repeats this
wherever the numbers appear.

Algorithm (deterministic — the same input always yields the same plan):
items are visited in board rank order; an item only becomes eligible after all of its in-set
blockers were visited. For each item the candidate pool is narrowed by tiers, in order:
explicit affinity (configured components/labels), then historical affinity (the person already
finished items of the same type and component), then everyone. Within the first tier that has
someone with enough residual capacity, the person with the most residual capacity wins; ties go
to the lowest account id. People already holding ``max_items_per_person`` items are skipped.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

TIER_EXPLICIT = "afinidade_explicita"
TIER_HISTORY = "afinidade_historica"
TIER_CAPACITY = "capacidade"
NO_CAPACITY = "sem_capacidade"

DISCLAIMER = (
    "Alocação teórica por heurística gulosa: é uma linha de base para conversa, não uma verdade. "
    "Ignora conhecimento tácito, pareamento, mentoria e interrupções."
)


@dataclass(frozen=True)
class AllocationItem:
    key: str
    rank: str | None
    cost_hours: float
    type_name: str
    components: tuple[str, ...] = ()
    labels: tuple[str, ...] = ()
    blocked_by: tuple[str, ...] = ()

    @property
    def tags(self) -> frozenset[str]:
        return frozenset(t.casefold() for t in (*self.components, *self.labels))


@dataclass(frozen=True)
class Candidate:
    account_id: str
    display_name: str
    capacity_hours: float


@dataclass(frozen=True)
class Assignment:
    key: str
    account_id: str | None
    rule: str
    cost_hours: float


@dataclass(frozen=True)
class AllocationPlan:
    assignments: tuple[Assignment, ...]
    capacity: Mapping[str, float]
    load: Mapping[str, float]
    parameters: Mapping[str, object] = field(default_factory=dict)
    warnings: tuple[str, ...] = ()

    @property
    def residual(self) -> dict[str, float]:
        return {k: round(self.capacity[k] - self.load.get(k, 0.0), 2) for k in self.capacity}

    def by_key(self) -> dict[str, Assignment]:
        return {a.key: a for a in self.assignments}

    def as_dict(self) -> dict[str, object]:
        return {
            "assignments": [a.__dict__ for a in self.assignments],
            "capacity": dict(self.capacity),
            "load": dict(self.load),
            "residual": self.residual,
            "parameters": dict(self.parameters),
            "warnings": list(self.warnings),
            "disclaimer": DISCLAIMER,
        }


def history_score(counts: Mapping[tuple[str, str, str], int], account_id: str, item: AllocationItem) -> int:
    components = item.components or ("",)
    return sum(counts.get((account_id, item.type_name, c), 0) for c in components)


def allocate(
    items: Sequence[AllocationItem],
    people: Sequence[Candidate],
    *,
    explicit_affinity: Mapping[str, Sequence[str]] | None = None,
    history_counts: Mapping[tuple[str, str, str], int] | None = None,
    max_items_per_person: int = 8,
    parameters: Mapping[str, object] | None = None,
) -> AllocationPlan:
    explicit = {acc: frozenset(t.casefold() for t in tags) for acc, tags in (explicit_affinity or {}).items()}
    counts = history_counts or {}
    pool = sorted(people, key=lambda p: p.account_id)
    residual = {p.account_id: float(p.capacity_hours) for p in pool}
    held = dict.fromkeys(residual, 0)
    in_set = {i.key for i in items}
    pending = sorted(items, key=lambda i: (i.rank or "~", i.key))
    visited: set[str] = set()
    assignments: list[Assignment] = []
    warnings: list[str] = []

    while pending:
        ready = next(
            (i for i in pending if all(b in visited or b not in in_set for b in i.blocked_by)),
            None,
        )
        if ready is None:
            ready = pending[0]
            warnings.append(f"Dependência circular de bloqueio envolvendo {ready.key}.")
        pending.remove(ready)

        open_pool = [p for p in pool if held[p.account_id] < max_items_per_person]
        tiers = (
            (TIER_EXPLICIT, [p for p in open_pool if ready.tags & explicit.get(p.account_id, frozenset())]),
            (TIER_HISTORY, [p for p in open_pool if history_score(counts, p.account_id, ready) > 0]),
            (TIER_CAPACITY, open_pool),
        )
        chosen: Candidate | None = None
        rule = NO_CAPACITY
        for tier_name, tier in tiers:
            fitting = [p for p in tier if residual[p.account_id] >= ready.cost_hours]
            if fitting:
                chosen = min(fitting, key=lambda p: (-residual[p.account_id], p.account_id))
                rule = tier_name
                break
        if chosen is not None:
            residual[chosen.account_id] -= ready.cost_hours
            held[chosen.account_id] += 1
        assignments.append(
            Assignment(
                key=ready.key,
                account_id=chosen.account_id if chosen else None,
                rule=rule,
                cost_hours=ready.cost_hours,
            )
        )
        visited.add(ready.key)

    capacity = {p.account_id: float(p.capacity_hours) for p in pool}
    load = {acc: round(capacity[acc] - residual[acc], 2) for acc in capacity}
    unallocated = [a.key for a in assignments if a.account_id is None]
    if unallocated:
        warnings.append(f"{len(unallocated)} item(ns) sem capacidade disponível: {', '.join(unallocated)}.")
    return AllocationPlan(
        assignments=tuple(assignments),
        capacity=capacity,
        load=load,
        parameters={"max_items_per_person": max_items_per_person, **(parameters or {})},
        warnings=tuple(warnings),
    )


@dataclass(frozen=True)
class PersonLoad:
    account_id: str
    display_name: str
    capacity_hours: float
    planned_hours: float
    actual_hours: float

    def deviation(self) -> float | None:
        if not self.capacity_hours:
            return None
        return round((self.actual_hours - self.capacity_hours) / self.capacity_hours, 3)

    def state(self, overload: float, idle: float) -> str:
        dev = self.deviation()
        if dev is None:
            return "sem_capacidade"
        if dev > overload:
            return "sobrecarga"
        if dev < idle:
            return "ociosidade"
        return "equilibrado"


@dataclass(frozen=True)
class PlanComparison:
    compared: int
    matches: int
    people: tuple[PersonLoad, ...]
    overload_threshold: float
    idle_threshold: float

    @property
    def adherence(self) -> float | None:
        return round(self.matches / self.compared, 3) if self.compared else None

    def as_dict(self) -> dict[str, object]:
        return {
            "adherence": self.adherence,
            "compared": self.compared,
            "matches": self.matches,
            "people": [
                {
                    **p.__dict__,
                    "deviation": p.deviation(),
                    "state": p.state(self.overload_threshold, self.idle_threshold),
                }
                for p in self.people
            ],
            "disclaimer": DISCLAIMER,
        }


def compare_plan(
    plan: AllocationPlan,
    actual: Mapping[str, str | None],
    names: Mapping[str, str],
    *,
    overload_threshold: float,
    idle_threshold: float,
) -> PlanComparison:
    planned = plan.by_key()
    compared = matches = 0
    actual_load: dict[str, float] = {}
    for key, assignment in planned.items():
        real = actual.get(key)
        if real:
            actual_load[real] = actual_load.get(real, 0.0) + assignment.cost_hours
        if assignment.account_id and real:
            compared += 1
            matches += assignment.account_id == real
    accounts = sorted(set(plan.capacity) | set(actual_load), key=lambda a: names.get(a, a).casefold())
    people = tuple(
        PersonLoad(
            account_id=acc,
            display_name=names.get(acc, acc),
            capacity_hours=plan.capacity.get(acc, 0.0),
            planned_hours=plan.load.get(acc, 0.0),
            actual_hours=round(actual_load.get(acc, 0.0), 2),
        )
        for acc in accounts
    )
    return PlanComparison(compared, matches, people, overload_threshold, idle_threshold)
