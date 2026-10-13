"""Theoretical capacity (RF-25): working days × hours per day × focus factor, minus absences."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from cadencia.domain.calendar import working_days_between
from cadencia.domain.models import BoardProfile, Person


@dataclass(frozen=True)
class Absence:
    account_id: str
    start: date
    end: date

    def dates(self) -> Iterable[date]:
        day = self.start
        while day <= self.end:
            yield day
            day += timedelta(days=1)


@dataclass(frozen=True)
class Availability:
    """How much of a person's time this team can count on, beyond absences.

    ``hours_per_day`` replaces the board's when set (someone on six-hour days); ``allocation`` is the
    share of their time given to the tracked boards (0.5 for someone split with another team).
    Both default to "no adjustment", so a person nobody registered keeps the board's numbers.
    """

    hours_per_day: float | None = None
    allocation: float = 1.0


@dataclass(frozen=True)
class PersonCapacity:
    account_id: str
    display_name: str
    working_days: int
    absence_days: int
    hours_per_day: float
    focus_factor: float
    allocation: float = 1.0

    @property
    def available_days(self) -> int:
        return max(self.working_days - self.absence_days, 0)

    @property
    def hours(self) -> float:
        return round(self.available_days * self.hours_per_day * self.focus_factor * self.allocation, 2)

    def as_dict(self) -> dict[str, object]:
        return {
            "account_id": self.account_id,
            "display_name": self.display_name,
            "working_days": self.working_days,
            "absence_days": self.absence_days,
            "available_days": self.available_days,
            "hours_per_day": self.hours_per_day,
            "focus_factor": self.focus_factor,
            "allocation": self.allocation,
            "hours": self.hours,
        }


def sprint_dates(start: datetime, end: datetime, tz: str) -> tuple[date, date]:
    zone = ZoneInfo(tz)
    return start.astimezone(zone).date(), end.astimezone(zone).date()


def _of(availability: Mapping[str, Availability], person: Person) -> Availability:
    return availability.get(person.account_id) or Availability()


def sprint_capacity(
    people: Sequence[Person],
    start: date,
    end: date,
    profile: BoardProfile,
    absences: Iterable[Absence] = (),
    *,
    focus_factor: float | None = None,
    hours_per_day: float | None = None,
    availability: Mapping[str, Availability] | None = None,
) -> list[PersonCapacity]:
    focus = profile.focus_factor if focus_factor is None else focus_factor
    per_day = profile.hours_per_day if hours_per_day is None else hours_per_day
    availability = availability or {}
    holidays = set(profile.holidays)
    working = working_days_between(start, end, holidays=holidays)
    absent: dict[str, set[date]] = {}
    for absence in absences:
        days = {d for d in absence.dates() if start <= d <= end and d.weekday() < 5 and d not in holidays}
        absent.setdefault(absence.account_id, set()).update(days)
    return [
        PersonCapacity(
            account_id=p.account_id,
            display_name=p.display_name,
            working_days=working,
            absence_days=len(absent.get(p.account_id, ())),
            # A simulation that sets the day length for everyone still wins over what was registered.
            hours_per_day=per_day
            if hours_per_day is not None
            else (_of(availability, p).hours_per_day or per_day),
            focus_factor=focus,
            allocation=_of(availability, p).allocation,
        )
        for p in sorted(people, key=lambda x: x.display_name.casefold())
    ]


def item_cost_hours(estimate: float | None, profile: BoardProfile) -> float:
    if estimate is None:
        return profile.unestimated_item_hours
    return round(estimate * profile.hours_per_point, 2)
