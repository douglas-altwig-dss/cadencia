from datetime import UTC, date, datetime

from cadencia.domain.calendar import (
    business_days,
    checkpoint_instants,
    sprint_timeline,
    working_days_between,
)
from cadencia.domain.models import Sprint
from tests.factories import CHECKPOINT_1, PROFILE, SPRINT_12, SPRINT_END, SPRINT_START


def test_two_week_sprint_has_two_windows_closed_by_friday_checkpoints():
    timeline = sprint_timeline(SPRINT_12, PROFILE)
    assert [w.end for w in timeline.windows] == [CHECKPOINT_1, SPRINT_END]
    assert [w.business_days for w in timeline.windows] == [5, 5]
    assert not any(w.partial for w in timeline.windows)
    assert timeline.warnings == ()


def test_three_week_sprint_is_recognised_without_configuration():
    sprint = Sprint(1, 1, "S", "active", SPRINT_START, datetime(2026, 9, 18, 21, 0, tzinfo=UTC))
    timeline = sprint_timeline(sprint, PROFILE)
    assert len(timeline.windows) == 3
    assert not timeline.assumed_end


def test_missing_end_date_is_assumed_and_warned():
    sprint = Sprint(1, 1, "S", "active", SPRINT_START, None)
    timeline = sprint_timeline(sprint, PROFILE)
    assert timeline.assumed_end
    assert len(timeline.windows) == 2
    assert any("sem data de fim" in str(w) for w in timeline.warnings)


def test_trailing_partial_window_is_its_own_window_with_real_duration():
    sprint = Sprint(1, 1, "S", "active", SPRINT_START, datetime(2026, 9, 9, 21, 0, tzinfo=UTC))
    timeline = sprint_timeline(sprint, PROFILE)
    assert len(timeline.windows) == 2
    last = timeline.windows[-1]
    assert last.partial and last.business_days == 3
    assert any("parcial" in str(w) for w in timeline.warnings)


def test_checkpoint_uses_board_time_zone():
    marks = checkpoint_instants(SPRINT_START, SPRINT_END, tz="America/Sao_Paulo", weekday=4, hour=18)
    assert marks == [CHECKPOINT_1, SPRINT_END]


def test_window_membership_is_left_open():
    timeline = sprint_timeline(SPRINT_12, PROFILE)
    first, second = timeline.windows
    assert first.contains(SPRINT_START)
    assert first.contains(CHECKPOINT_1)
    assert not second.contains(CHECKPOINT_1)


def test_business_days_and_holidays():
    assert business_days(SPRINT_START, SPRINT_END, tz="America/Sao_Paulo") == 10
    assert working_days_between(date(2026, 8, 31), date(2026, 9, 11), holidays=[date(2026, 9, 7)]) == 9
