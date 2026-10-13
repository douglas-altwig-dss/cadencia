from datetime import date, timedelta

from cadencia.domain.calendar import profile_checkpoints
from cadencia.domain.risk import RiskContext, Situation, assess
from tests.factories import (
    ANA,
    BRUNO,
    DOING,
    DONE,
    PROFILE,
    REVIEW,
    SPRINT_11,
    SPRINT_12,
    TODO,
    at,
    flag,
    history,
    issue,
    move,
    reassign,
    sprint_change,
)

AS_OF = at("2026-09-11T21:00")  # Friday checkpoint closing window 2


def ctx(as_of=AS_OF, thresholds=None, done=None):
    return RiskContext(
        profile=PROFILE,
        as_of=as_of,
        checkpoints=profile_checkpoints(PROFILE, as_of - timedelta(days=60), as_of),
        sprints={11: SPRINT_11, 12: SPRINT_12},
        aging_thresholds=thresholds or {},
        blocker_done=(lambda key: (done or {}).get(key)),
    )


def test_item_without_transition_between_checkpoints_is_stagnant():
    h = history(issue("A-1", status=DOING, sprints=(12,)), move("A-1", "2026-09-01T12:00", TODO, DOING))
    result = assess(h, ctx())
    assert result.situation is Situation.STAGNANT
    assert result.stalled_checkpoints == 1
    evidence = result.evidence[0]
    assert evidence.message == "parado há 10 dias em Em andamento"
    assert evidence.last_transition_author == "Ana"
    assert evidence.last_transition_to == "Em andamento"


def test_reassignment_without_status_change_keeps_item_stagnant_with_evidence():
    # RF-16 acceptance.
    h = history(
        issue("A-2", status=DOING, assignee=BRUNO),
        move("A-2", "2026-09-01T12:00", TODO, DOING),
        reassign("A-2", "2026-09-08T12:00", ANA, BRUNO),
    )
    result = assess(h, ctx())
    assert result.situation is Situation.STAGNANT
    assert any("responsável mudou de Ana para Bruno" in d for d in result.evidence[0].details)


def test_counts_how_many_checkpoints_the_item_stayed_still():
    h = history(issue("A-3", status=REVIEW), move("A-3", "2026-08-26T12:00", DOING, REVIEW))
    result = assess(h, ctx())
    assert result.stalled_checkpoints == 2
    assert "(2 checkpoints sem transição)" in result.evidence[0].message


def test_moving_after_the_previous_checkpoint_is_not_stagnation():
    h = history(issue("A-4", status=REVIEW), move("A-4", "2026-09-07T12:00", DOING, REVIEW))
    assert assess(h, ctx()).situation is Situation.ON_TRACK


def test_blocked_by_flag_status_or_open_blocker():
    flagged = history(
        issue("B-1", status=DOING),
        move("B-1", "2026-09-10T12:00", TODO, DOING),
        flag("B-1", "2026-09-10T13:00"),
    )
    assert assess(flagged, ctx()).situation is Situation.BLOCKED
    waiting = history(issue("B-2", blocked_by=("B-9",)))
    assert assess(waiting, ctx(done={"B-9": False})).situation is Situation.BLOCKED
    assert assess(waiting, ctx(done={"B-9": True})).situation is Situation.ON_TRACK
    assert assess(waiting, ctx()).situation is Situation.ON_TRACK  # unknown blocker: no claim


def test_overdue_uses_board_local_date():
    h = history(issue("C-1", due=date(2026, 9, 8)))
    result = assess(h, ctx())
    assert result.situation is Situation.OVERDUE
    assert result.evidence[0].message == "data limite 08/09 vencida há 3 dias"


def test_carried_over_is_most_severe_and_keeps_all_evidence():
    h = history(
        issue("D-1", status=DOING, sprints=(11, 12), due=date(2026, 9, 1)),
        sprint_change("D-1", "2026-08-18T12:00", None, "11"),
        move("D-1", "2026-08-20T12:00", TODO, DOING),
        sprint_change("D-1", "2026-08-28T21:06", "11", "11, 12"),
    )
    result = assess(h, ctx())
    assert result.situation is Situation.CARRIED_OVER
    assert result.carried_sprints == 1
    assert [e.situation for e in result.evidence] == [
        Situation.CARRIED_OVER,
        Situation.OVERDUE,
        Situation.STAGNANT,
    ]


def test_aging_uses_learned_percentile_threshold():
    h = history(
        issue("E-1", status=REVIEW),
        move("E-1", "2026-09-07T12:00", TODO, DOING),
        move("E-1", "2026-09-08T12:00", DOING, REVIEW),
    )
    result = assess(h, ctx(thresholds={"Story": 3.0}))
    assert result.situation is Situation.AGING
    assert result.wip_age_days == 4.4
    assert assess(h, ctx(thresholds={"Story": 5.0})).situation is Situation.ON_TRACK


def test_done_items_are_on_track_and_classification_is_deterministic():
    done = history(issue("F-1", status=DONE), move("F-1", "2026-09-02T12:00", TODO, DONE))
    assert assess(done, ctx()).evidence == ()
    h = history(issue("F-2", status=DOING), move("F-2", "2026-08-20T12:00", TODO, DOING))
    assert assess(h, ctx()) == assess(h, ctx())
