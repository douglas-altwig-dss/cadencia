"""Delivery forecast by Monte Carlo over the team's own throughput (RF-72).

Everything else in Cadência measures the past; planning asks about the future. The answer here is
built only from what the board already did: the number of items finished on each recent business
day is the sample, and each simulated future day draws one of those days at random. Running that a
few thousand times gives a distribution of "how many business days until the remaining items are
done", which is honest about its own uncertainty in a way a single velocity number never is.

The generator is seeded from the inputs, so the same data always gives the same forecast — a
number that moved between two page loads would be read as news.
"""

from __future__ import annotations

import hashlib
import math
import random
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from cadencia.domain.history import IssueHistory

RUNS = 2000
#: Business days of history the sample is drawn from: about three months of work.
SAMPLE_DAYS = 60
#: Beyond this the simulation stops and says "more than N days" instead of looping forever on a
#: sample that finishes almost nothing.
MAX_DAYS = 260
LOW_CONFIDENCE_DAYS = 10  # fewer business days with any delivery than this: flag it


@dataclass(frozen=True)
class Forecast:
    remaining: int
    sample_days: int
    delivered_in_sample: int
    #: Business days needed at P50/P85/P95; None when the simulation hit MAX_DAYS.
    p50_days: int | None
    p85_days: int | None
    p95_days: int | None
    p50_date: date | None
    p85_date: date | None
    p95_date: date | None
    #: Chance of finishing within ``horizon_days``; None when no horizon was asked about.
    horizon_days: int | None
    probability: float | None
    low_confidence: bool
    reason: str | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "remaining": self.remaining,
            "sample_days": self.sample_days,
            "delivered_in_sample": self.delivered_in_sample,
            "p50_days": self.p50_days,
            "p85_days": self.p85_days,
            "p95_days": self.p95_days,
            "p50_date": self.p50_date.isoformat() if self.p50_date else None,
            "p85_date": self.p85_date.isoformat() if self.p85_date else None,
            "p95_date": self.p95_date.isoformat() if self.p95_date else None,
            "horizon_days": self.horizon_days,
            "probability": self.probability,
            "low_confidence": self.low_confidence,
            "reason": self.reason,
        }


def business_dates(start: date, count: int, holidays: Iterable[date] = ()) -> list[date]:
    """The next ``count`` business days after ``start`` (exclusive)."""
    skip = set(holidays)
    out: list[date] = []
    day = start
    while len(out) < count:
        day += timedelta(days=1)
        if day.weekday() < 5 and day not in skip:
            out.append(day)
    return out


def past_business_dates(end: date, count: int, holidays: Iterable[date] = ()) -> list[date]:
    """The ``count`` business days up to and including ``end``, oldest first."""
    skip = set(holidays)
    out: list[date] = []
    day = end
    while len(out) < count:
        if day.weekday() < 5 and day not in skip:
            out.append(day)
        day -= timedelta(days=1)
    return list(reversed(out))


def daily_throughput(
    histories: Iterable[IssueHistory],
    as_of: datetime,
    *,
    tz: str,
    days: int = SAMPLE_DAYS,
    holidays: Iterable[date] = (),
) -> list[int]:
    """Items finished on each of the last ``days`` business days, as of ``as_of``."""
    zone = ZoneInfo(tz)
    today = as_of.astimezone(zone).date()
    dates = past_business_dates(today, days, holidays)
    counts = dict.fromkeys(dates, 0)
    since = datetime.combine(dates[0], time(0), tzinfo=zone) if dates else as_of
    for history in histories:
        done = history.done_at(as_of)
        if done is None or done < since:
            continue
        day = done.astimezone(zone).date()
        if day in counts:
            counts[day] += 1
    return [counts[d] for d in dates]


def _seed(samples: Sequence[int], remaining: int, horizon: int | None) -> int:
    digest = hashlib.sha256(f"{list(samples)}|{remaining}|{horizon}".encode()).hexdigest()
    return int(digest[:16], 16)


def _nearest_rank(ordered: Sequence[int], p: float) -> int:
    return ordered[max(1, math.ceil(p / 100 * len(ordered))) - 1]


def monte_carlo(
    samples: Sequence[int],
    remaining: int,
    start: date,
    *,
    horizon_days: int | None = None,
    holidays: Iterable[date] = (),
    runs: int = RUNS,
) -> Forecast:
    """How many business days until ``remaining`` items are done, drawing days from ``samples``."""
    holidays = tuple(holidays)
    delivered = sum(samples)
    active_days = sum(1 for s in samples if s)
    low = active_days < LOW_CONFIDENCE_DAYS

    def empty(reason: str | None, probability: float | None) -> Forecast:
        return Forecast(
            remaining,
            len(samples),
            delivered,
            None,
            None,
            None,
            None,
            None,
            None,
            horizon_days,
            probability,
            low,
            reason,
        )

    if remaining <= 0:
        return Forecast(
            0,
            len(samples),
            delivered,
            0,
            0,
            0,
            start,
            start,
            start,
            horizon_days,
            1.0 if horizon_days is not None else None,
            low,
        )
    if not samples or delivered == 0:
        return empty("Nenhum item concluído no período de amostra: não há ritmo para projetar.", None)

    rng = random.Random(_seed(samples, remaining, horizon_days))
    needed: list[int] = []
    for _ in range(runs):
        left, day = remaining, 0
        while left > 0 and day < MAX_DAYS:
            left -= samples[rng.randrange(len(samples))]
            day += 1
        needed.append(day if left <= 0 else MAX_DAYS + 1)
    needed.sort()
    probability = None
    if horizon_days is not None:
        probability = round(sum(1 for n in needed if n <= horizon_days) / runs, 3)
    p50, p85, p95 = (_nearest_rank(needed, p) for p in (50, 85, 95))
    calendar = business_dates(start, min(max(p95, 1), MAX_DAYS), holidays)

    def at(days: int) -> tuple[int | None, date | None]:
        if days > MAX_DAYS:
            return None, None
        return days, calendar[days - 1] if days >= 1 else start

    (d50, t50), (d85, t85), (d95, t95) = at(p50), at(p85), at(p95)
    reason = None if d95 is not None else f"Parte das simulações passa de {MAX_DAYS} dias úteis."
    return Forecast(
        remaining,
        len(samples),
        delivered,
        d50,
        d85,
        d95,
        t50,
        t85,
        t95,
        horizon_days,
        probability,
        low,
        reason,
    )
