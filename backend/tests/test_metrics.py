from cadencia.domain.calendar import sprint_timeline
from cadencia.domain.metrics import (
    aging_thresholds,
    distribution,
    item_metrics,
    percentile,
    summarize,
    throughput,
)
from tests.factories import DOING, DONE, PROFILE, REVIEW, SPRINT_12, TODO, at, history, issue, move

NOW = at("2026-09-11T21:00")


def test_percentiles_use_nearest_rank_and_flag_small_samples():
    values = list(range(1, 11))
    assert percentile(values, 50) == 5
    assert percentile(values, 85) == 9
    assert percentile(values, 95) == 10
    assert percentile([], 50) is None
    assert distribution([1, 2, 3]).low_confidence
    assert not distribution(values).low_confidence


def test_item_metrics_lead_cycle_queue_and_rework():
    h = history(
        issue("M-1", status=DONE, created="2026-08-31T12:00"),
        move("M-1", "2026-09-01T12:00", TODO, DOING),
        move("M-1", "2026-09-03T12:00", DOING, REVIEW),
        move("M-1", "2026-09-04T12:00", REVIEW, DOING),
        move("M-1", "2026-09-05T12:00", DOING, DONE),
    )
    m = item_metrics(h, PROFILE, NOW)
    assert (m.lead_days, m.cycle_days, m.queue_days) == (5.0, 4.0, 1.0)
    assert m.backward_moves == 1
    assert not m.reopened
    assert m.flow_efficiency == 0.8


def test_throughput_counts_category_changes_inside_each_window():
    first = history(issue("T-1", status=DONE), move("T-1", "2026-09-02T12:00", TODO, DONE))
    second = history(issue("T-2", status=DONE), move("T-2", "2026-09-08T12:00", TODO, DONE))
    windows = sprint_timeline(SPRINT_12, PROFILE).windows
    assert throughput([first, second], windows) == [1, 1]


def test_aging_thresholds_need_a_minimum_sample():
    done = []
    for i, days in enumerate([1, 2, 2, 3, 4]):
        h = history(
            issue(f"H-{i}", status=DONE, created="2026-08-01T12:00"),
            move(f"H-{i}", "2026-08-10T12:00", TODO, DOING),
            move(f"H-{i}", f"2026-08-{10 + days}T12:00", DOING, DONE),
        )
        done.append(item_metrics(h, PROFILE, NOW))
    assert aging_thresholds(done) == {"Story": 4.0, "*": 4.0}
    assert aging_thresholds(done[:3]) == {}
    summary = summarize(done)
    assert summary.completed == 5 and summary.cycle.p50 == 2.0
    assert summary.reopen_rate == 0.0
