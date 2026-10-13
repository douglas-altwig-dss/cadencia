"""Sprint windows and checkpoints (RF-06, RF-07).

All arithmetic is in UTC; the board time zone only decides *where* a checkpoint falls
("sexta às 18h em America/Sao_Paulo"). Windows are half-open on the left: an event at ``t``
belongs to the window where ``start < t <= end`` (the first window also includes its start).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from itertools import pairwise
from zoneinfo import ZoneInfo

from cadencia.domain.models import BoardProfile, Sprint

WORKDAY_START = time(9)
WORKDAY_END = time(18)
MIN_TRAILING_WINDOW = timedelta(days=3)
MIN_SPRINT_WEEKS, MAX_SPRINT_WEEKS = 2, 3


@dataclass(frozen=True, slots=True)
class Window:
    index: int  # 1-based
    start: datetime
    end: datetime  # the checkpoint that closes the window
    business_days: int
    partial: bool

    @property
    def days(self) -> float:
        return round((self.end - self.start).total_seconds() / 86400, 2)

    def contains(self, at: datetime) -> bool:
        return self.start < at <= self.end or (self.index == 1 and at == self.start)

    def is_open(self, now: datetime) -> bool:
        return self.start <= now < self.end


@dataclass(frozen=True)
class SprintTimeline:
    sprint_id: int | None
    start: datetime | None
    end: datetime | None
    windows: tuple[Window, ...]
    assumed_end: bool
    warnings: tuple[str, ...]

    def window_at(self, at: datetime) -> Window | None:
        for window in self.windows:
            if window.contains(at):
                return window
        return None

    def current_window(self, now: datetime) -> Window | None:
        if not self.windows:
            return None
        if now <= self.windows[0].start:
            return self.windows[0]
        for window in self.windows:
            if window.start < now <= window.end:
                return window
        return self.windows[-1]

    def closed_windows(self, now: datetime) -> tuple[Window, ...]:
        return tuple(w for w in self.windows if w.end <= now)


def _tz(name: str) -> ZoneInfo:
    return ZoneInfo(name)


def checkpoint_instants(
    start: datetime, end: datetime, *, tz: str, weekday: int, hour: int
) -> list[datetime]:
    """Every configured checkpoint instant in ``[start, end]``, in UTC."""
    zone = _tz(tz)
    first = start.astimezone(zone).date() - timedelta(days=1)
    last = end.astimezone(zone).date() + timedelta(days=1)
    out: list[datetime] = []
    day = first
    while day <= last:
        if day.weekday() == weekday:
            instant = datetime.combine(day, time(hour), tzinfo=zone).astimezone(UTC)
            if start <= instant <= end:
                out.append(instant)
        day += timedelta(days=1)
    return out


def profile_checkpoints(profile: BoardProfile, start: datetime, end: datetime) -> list[datetime]:
    return checkpoint_instants(
        start,
        end,
        tz=profile.timezone,
        weekday=profile.checkpoint_weekday,
        hour=profile.checkpoint_hour,
    )


def last_checkpoints(profile: BoardProfile, until: datetime, count: int) -> list[datetime]:
    """The ``count`` most recent checkpoints at or before ``until`` (ascending)."""
    span = timedelta(days=7 * (count + 1))
    return profile_checkpoints(profile, until - span, until)[-count:]


def business_days(start: datetime, end: datetime, *, tz: str, holidays: Iterable[date] = ()) -> int:
    """Weekdays whose working hours (09h–18h local) overlap ``(start, end]``."""
    zone = _tz(tz)
    skip = set(holidays)
    day = start.astimezone(zone).date()
    last = end.astimezone(zone).date()
    count = 0
    while day <= last:
        if day.weekday() < 5 and day not in skip:
            opens = datetime.combine(day, WORKDAY_START, tzinfo=zone)
            closes = datetime.combine(day, WORKDAY_END, tzinfo=zone)
            if start < closes and end > opens:
                count += 1
        day += timedelta(days=1)
    return count


def build_windows(start: datetime, end: datetime, profile: BoardProfile) -> tuple[Window, ...]:
    """Slice ``[start, end]`` into ~7-day windows, each closed by the nearest checkpoint."""
    windows: list[Window] = []
    cursor = start
    index = 0
    while cursor < end:
        index += 1
        nominal = start + timedelta(days=7 * index)
        candidates = profile_checkpoints(profile, cursor + timedelta(days=1), nominal + timedelta(days=7))
        close = (
            min(candidates, key=lambda c: (abs((c - nominal).total_seconds()), c)) if candidates else nominal
        )
        if close >= end or end - close < MIN_TRAILING_WINDOW:
            close = end
        days = business_days(cursor, close, tz=profile.timezone, holidays=profile.holidays)
        is_last = close == end
        windows.append(
            Window(
                index=index,
                start=cursor,
                end=close,
                business_days=days,
                partial=is_last and index > 1 and days < 5,
            )
        )
        cursor = close
    return tuple(windows)


def sprint_timeline(sprint: Sprint, profile: BoardProfile) -> SprintTimeline:
    warnings: list[str] = []
    if sprint.start is None:
        return SprintTimeline(
            sprint_id=sprint.id,
            start=None,
            end=sprint.end,
            windows=(),
            assumed_end=False,
            warnings=("Sprint sem data de início no Jira: janelas indisponíveis até ela começar.",),
        )
    start = sprint.start
    end = sprint.end
    assumed = False
    if end is None or end <= start:
        weeks = min(max(profile.default_sprint_weeks, MIN_SPRINT_WEEKS), MAX_SPRINT_WEEKS)
        end = start + timedelta(weeks=weeks)
        assumed = True
        reason = "sem data de fim" if sprint.end is None else "com data de fim anterior ao início"
        warnings.append(f"Sprint {reason} no Jira: assumida a duração configurada de {weeks} semanas.")
    elif end - start > timedelta(weeks=MAX_SPRINT_WEEKS, days=1):
        warnings.append("Sprint com mais de três semanas: confira as datas no Jira.")
    windows = build_windows(start, end, profile)
    if windows and windows[-1].partial:
        last = windows[-1]
        warnings.append(
            f"Janela {last.index} é parcial: {last.business_days} dias úteis ({last.days} dias corridos)."
        )
    return SprintTimeline(
        sprint_id=sprint.id,
        start=start,
        end=end,
        windows=windows,
        assumed_end=assumed,
        warnings=tuple(warnings),
    )


def calendar_windows(profile: BoardProfile, until: datetime, count: int) -> tuple[Window, ...]:
    """Weekly windows for kanban boards: the last ``count`` checkpoint-to-checkpoint spans,
    plus the open window running from the last checkpoint to ``until``."""
    marks = last_checkpoints(profile, until, count + 1)
    windows: list[Window] = []
    for i, (lo, hi) in enumerate(pairwise(marks), start=1):
        days = business_days(lo, hi, tz=profile.timezone, holidays=profile.holidays)
        windows.append(Window(index=i, start=lo, end=hi, business_days=days, partial=False))
    if marks and until > marks[-1]:
        nxt = profile_checkpoints(profile, marks[-1] + timedelta(hours=1), marks[-1] + timedelta(days=8))
        hi = nxt[0] if nxt else marks[-1] + timedelta(days=7)
        days = business_days(marks[-1], hi, tz=profile.timezone, holidays=profile.holidays)
        windows.append(
            Window(index=len(windows) + 1, start=marks[-1], end=hi, business_days=days, partial=False)
        )
    return tuple(windows)


def working_days_between(
    start: date, end: date, *, holidays: Iterable[date] = (), absences: Iterable[date] = ()
) -> int:
    skip = set(holidays) | set(absences)
    day = start
    count = 0
    while day <= end:
        if day.weekday() < 5 and day not in skip:
            count += 1
        day += timedelta(days=1)
    return count
