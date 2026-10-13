from cadencia.domain.commitment import commitment_report
from cadencia.domain.compare import compare_window
from cadencia.domain.models import Sprint
from tests.factories import (
    ANA,
    BRUNO,
    CHECKPOINT_1,
    DOING,
    DONE,
    SPRINT_12,
    SPRINT_END,
    SPRINT_START,
    TODO,
    at,
    history,
    issue,
    move,
    reassign,
    sprint_change,
)


def scenario():
    return [
        history(  # committed, delivered in window 1
            issue("W-1", status=DONE, sprints=(12,), assignee=ANA, estimate=3),
            sprint_change("W-1", "2026-08-30T12:00", None, "12"),
            move("W-1", "2026-09-02T12:00", TODO, DONE),
        ),
        history(  # added mid-window, delivered
            issue("W-2", status=DONE, sprints=(12,), assignee=BRUNO, estimate=2, created="2026-09-01T12:00"),
            sprint_change("W-2", "2026-09-02T12:00", None, "12"),
            move("W-2", "2026-09-03T12:00", TODO, DONE),
        ),
        history(  # committed then removed
            issue("W-3", sprints=(13,), assignee=ANA),
            sprint_change("W-3", "2026-08-30T12:00", None, "12"),
            sprint_change("W-3", "2026-09-03T12:00", "12", "13"),
        ),
        history(  # committed, open, never moved
            issue("W-4", status=DOING, sprints=(12,), assignee=BRUNO),
            sprint_change("W-4", "2026-08-30T12:00", None, "12"),
            move("W-4", "2026-08-28T12:00", TODO, DOING),
        ),
        history(  # committed, moved but not done
            issue("W-5", status=DOING, sprints=(12,), assignee=ANA),
            sprint_change("W-5", "2026-08-30T12:00", None, "12"),
            move("W-5", "2026-09-03T12:00", TODO, DOING),
        ),
        history(  # subtask: never counted in commitment
            issue("W-6", status=DONE, sprints=(12,), level=-1, parent="W-1"),
            sprint_change("W-6", "2026-08-30T12:00", None, "12"),
            move("W-6", "2026-09-02T12:00", TODO, DONE),
        ),
    ]


def test_window_comparison_produces_the_four_sets():
    items = [h for h in scenario() if h.issue.hierarchy_level == 0]
    diff = compare_window(items, SPRINT_START, CHECKPOINT_1, 12)
    assert diff.completed == ("W-1", "W-2")
    assert diff.added == ("W-2",)
    assert diff.removed == ("W-3",)
    assert diff.unmoved == ("W-4",)


def test_commitment_separates_added_scope_and_keeps_owner_at_start():
    items = scenario()
    items.append(
        history(  # taken by Ana at start, finished by Bruno
            issue("W-7", status=DONE, sprints=(12,), assignee=BRUNO),
            sprint_change("W-7", "2026-08-30T12:00", None, "12"),
            reassign("W-7", "2026-09-05T12:00", ANA, BRUNO),
            move("W-7", "2026-09-06T12:00", TODO, DONE),
        )
    )
    report = commitment_report(items, SPRINT_12, at("2026-09-10T12:00"))
    assert sorted(report.committed) == ["W-1", "W-3", "W-4", "W-5", "W-7"]
    assert report.delivered == ["W-1", "W-7"]
    assert report.removed == ["W-3"]
    assert report.remaining == ["W-4", "W-5"]
    assert report.added == ["W-2"] and report.added_delivered == ["W-2"]
    assert report.board.adherence == 0.4
    ana = next(p for p in report.people if p.owner_name == "Ana")
    assert (ana.committed, ana.delivered) == (4, 2)
    assert [p.owner_name for p in report.people] == ["Ana", "Bruno"]
    assert report.carryover_rate is None  # sprint still open


def test_carryover_rate_once_the_sprint_is_closed():
    closed = Sprint(12, 1, "Sprint 12", "closed", SPRINT_START, SPRINT_END, SPRINT_END)
    report = commitment_report(scenario(), closed, at("2026-09-20T12:00"))
    assert report.closed
    assert report.carryover_rate == 0.5  # W-4 and W-5 of 4 committed work items
