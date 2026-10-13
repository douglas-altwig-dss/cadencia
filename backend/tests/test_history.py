from datetime import timedelta

from cadencia.domain.history import parse_sprint_ids
from tests.factories import (
    ANA,
    BRUNO,
    DOING,
    DONE,
    REVIEW,
    TODO,
    at,
    flag,
    history,
    issue,
    move,
    reassign,
    sprint_change,
)


def test_status_timeline_and_done_at_after_reopen():
    item = issue("X-1", status=DONE)
    h = history(
        item,
        move("X-1", "2026-09-01T12:00", TODO, DOING),
        move("X-1", "2026-09-02T12:00", DOING, DONE),
        move("X-1", "2026-09-03T12:00", DONE, DOING),
        move("X-1", "2026-09-04T12:00", DOING, DONE),
    )
    assert h.status_at(at("2026-08-24T12:00")) is None
    assert h.status_at(at("2026-08-30T12:00")) == TODO
    assert h.status_at(at("2026-09-03T13:00")) == DOING
    assert h.done_at(at("2026-09-05T00:00")) == at("2026-09-04T12:00")
    assert h.reopened()
    assert not h.is_done_at(at("2026-09-03T18:00"))


def test_other_fields_as_of_an_instant():
    item = issue("X-2", assignee=BRUNO, sprints=(11, 12))
    h = history(
        item,
        reassign("X-2", "2026-09-01T12:00", ANA, BRUNO),
        sprint_change("X-2", "2026-08-28T21:06", "11", "11, 12"),
        flag("X-2", "2026-09-02T12:00"),
        flag("X-2", "2026-09-03T12:00", on=False),
    )
    assert h.assignee_at(at("2026-08-31T00:00")) == ANA
    assert h.assignee_at(at("2026-09-02T00:00")).account_id == BRUNO.account_id
    assert h.sprints_at(at("2026-08-28T00:00")) == {11}
    assert h.sprints_at(at("2026-09-01T00:00")) == {11, 12}
    assert h.all_sprints() == {11, 12}
    assert h.flagged_at(at("2026-09-02T18:00"))
    assert not h.flagged_at(at("2026-09-04T00:00"))
    assert h.flagged_time(item.created, at("2026-09-10T00:00")) == timedelta(days=1)


def test_time_in_and_backward_moves():
    item = issue("X-3", status=DONE, created="2026-08-31T12:00")
    h = history(
        item,
        move("X-3", "2026-09-01T12:00", TODO, DOING),
        move("X-3", "2026-09-03T12:00", DOING, REVIEW),
        move("X-3", "2026-09-04T12:00", REVIEW, DOING),
        move("X-3", "2026-09-05T12:00", DOING, DONE),
    )
    in_doing = h.time_in(lambda s: s == DOING, item.created, at("2026-09-10T00:00"))
    assert in_doing == timedelta(days=3)
    order = {TODO.id: 0, DOING.id: 1, REVIEW.id: 2, DONE.id: 3}
    assert h.backward_moves(lambda s: order[s.id]) == 1


def test_parse_sprint_ids_accepts_jira_formats():
    assert parse_sprint_ids("12, 13") == {12, 13}
    assert parse_sprint_ids(None) == frozenset()
    assert parse_sprint_ids("") == frozenset()
