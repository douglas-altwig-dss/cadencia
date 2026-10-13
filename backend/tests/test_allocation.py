from datetime import date

from cadencia.domain.allocation import AllocationItem, Candidate, allocate, compare_plan
from cadencia.domain.capacity import Absence, item_cost_hours, sprint_capacity
from tests.factories import ANA, BRUNO, CARLA, PROFILE

PEOPLE = [
    Candidate("acc-ana", "Ana", 40),
    Candidate("acc-bruno", "Bruno", 30),
    Candidate("acc-carla", "Carla", 30),
]


def test_capacity_discounts_absences_on_working_days_only():
    absences = [
        Absence("acc-ana", date(2026, 9, 7), date(2026, 9, 8)),
        Absence("acc-ana", date(2026, 9, 5), date(2026, 9, 5)),
    ]
    rows = sprint_capacity([ANA, BRUNO], date(2026, 8, 31), date(2026, 9, 11), PROFILE, absences)
    ana, bruno = rows
    assert (ana.working_days, ana.absence_days, ana.hours) == (10, 2, 44.8)
    assert bruno.hours == 56.0


def test_item_cost_uses_estimate_or_default():
    assert item_cost_hours(3, PROFILE) == 12
    assert item_cost_hours(None, PROFILE) == PROFILE.unestimated_item_hours


def test_same_input_always_gives_the_same_plan():
    items = [AllocationItem(f"K-{i}", f"r{i}", 8, "Story") for i in range(6)]
    first = allocate(items, PEOPLE)
    second = allocate(list(reversed(items)), list(reversed(PEOPLE)))
    assert first.as_dict() == second.as_dict()


def test_blocked_items_are_never_allocated_before_their_blockers():
    items = [
        AllocationItem("B", "a", 8, "Story", blocked_by=("A",)),
        AllocationItem("A", "b", 8, "Story"),
    ]
    plan = allocate(items, PEOPLE)
    assert [a.key for a in plan.assignments] == ["A", "B"]


def test_affinity_tiers_then_capacity_then_id():
    items = [
        AllocationItem("API", "a", 8, "Story", components=("api",)),
        AllocationItem("BUG", "b", 8, "Bug"),
        AllocationItem("ANY", "c", 8, "Story"),
    ]
    plan = allocate(
        items,
        PEOPLE,
        explicit_affinity={"acc-bruno": ["API"]},
        history_counts={("acc-carla", "Bug", ""): 3},
    )
    chosen = {a.key: (a.account_id, a.rule) for a in plan.assignments}
    assert chosen["API"] == ("acc-bruno", "afinidade_explicita")
    assert chosen["BUG"] == ("acc-carla", "afinidade_historica")
    assert chosen["ANY"] == ("acc-ana", "capacidade")
    tie = allocate([AllocationItem("T", "a", 1, "Story")], [Candidate("z", "Z", 10), Candidate("a", "A", 10)])
    assert tie.assignments[0].account_id == "a"


def test_items_without_capacity_are_reported():
    plan = allocate([AllocationItem("BIG", "a", 100, "Story")], PEOPLE)
    assert plan.assignments[0].account_id is None
    assert any("sem capacidade" in w for w in plan.warnings)


def test_plan_comparison_adherence_and_load_states():
    items = [AllocationItem(f"K-{i}", f"r{i}", 10, "Story") for i in range(4)]
    plan = allocate(items, PEOPLE)
    planned = {a.key: a.account_id for a in plan.assignments}
    actual = dict(planned)
    actual["K-0"] = "acc-carla"
    names = {c.account_id: c.display_name for c in PEOPLE}
    comparison = compare_plan(plan, actual, names, overload_threshold=0.1, idle_threshold=-0.2)
    assert comparison.adherence == 0.75
    states = {p["display_name"]: p["state"] for p in comparison.as_dict()["people"]}
    assert set(states.values()) <= {"sobrecarga", "ociosidade", "equilibrado"}
    assert CARLA.display_name in states
