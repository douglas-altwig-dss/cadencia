"""Locale formatting for catalogue entries: plurals, lists, dates, numbers, hours.

Catalogue entries pass their own locale explicitly (``day_month(due, "de-DE")``); everything else
may leave it out and get the ambient one. Dates match the web client's ``Intl`` output with
``{day: '2-digit', month: '2-digit'}`` (docs/i18n-backend.md, 2.9).
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime

from cadencia.i18n.message import Msg
from cadencia.i18n.render import render
from cadencia.i18n.runtime import current_locale, negotiate

_DECIMAL_COMMA = frozenset({"pt-BR", "de-DE"})


def _locale(locale: str | None) -> str:
    return current_locale() if locale is None else negotiate(locale)


def plural(count: float, one: str, other: str) -> str:
    """The word only — ``one`` when ``count`` is exactly 1, else ``other``.

    ``f"{n} {plural(n, 'day', 'days')}"``. Unlike the web client's ``plural``, the number is not
    included, so an entry can put it (or an inflected form) wherever the sentence needs it.
    """
    return one if count == 1 else other


def listing(items: Sequence[str], limit: int = 12, locale: str | None = None) -> str:
    """``"A, B and 5 more"`` / ``"A, B e mais 5"`` / ``"A, B und 5 weitere"``: the first
    ``limit`` items, then how many were left out."""
    shown = ", ".join(str(item) for item in items[:limit])
    if len(items) <= limit:
        return shown
    return render(Msg("common.listing.more", shown=shown, more=len(items) - limit), _locale(locale))


def _as_datetime(value: date | datetime | str) -> date | datetime:
    if isinstance(value, datetime | date):
        return value
    text = str(value).strip()
    if len(text) == 10:
        return date.fromisoformat(text)
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def _time(value: date | datetime) -> str:
    if not isinstance(value, datetime):
        raise TypeError("a time was asked for a date without one")
    return f" {value:%H:%M}"


def day_month(value: date | datetime | str, locale: str | None = None, *, time: bool = False) -> str:
    """``08/09`` (pt-BR), ``09/08`` (en-US), ``08.09.`` (de-DE); with ``time``, `` 15:00`` after.

    ``value`` is a date, a datetime or an ISO string, already in the reader's time zone (nothing is
    converted here)."""
    moment, loc = _as_datetime(value), _locale(locale)
    if loc == "en-US":
        text = f"{moment:%m/%d}"
    elif loc == "de-DE":
        text = f"{moment:%d.%m.}"
    else:
        text = f"{moment:%d/%m}"
    return text + (_time(moment) if time else "")


def day_month_year(value: date | datetime | str, locale: str | None = None, *, time: bool = False) -> str:
    """``08/09/2026`` (pt-BR), ``09/08/2026`` (en-US), ``08.09.2026`` (de-DE); see :func:`day_month`."""
    moment, loc = _as_datetime(value), _locale(locale)
    if loc == "en-US":
        text = f"{moment:%m/%d/%Y}"
    elif loc == "de-DE":
        text = f"{moment:%d.%m.%Y}"
    else:
        text = f"{moment:%d/%m/%Y}"
    return text + (_time(moment) if time else "")


def number(value: float, locale: str | None = None, digits: int = 1) -> str:
    """``1234.5`` → ``1,234.5`` (en-US) / ``1.234,5`` (pt-BR, de-DE): rounded to at most ``digits``
    decimals, trailing zeros dropped, thousands grouped (``Intl.NumberFormat``'s default shape)."""
    loc = _locale(locale)
    text = f"{round(float(value), digits):,.{max(digits, 0)}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    if text in ("-0", ""):
        text = "0"
    if loc in _DECIMAL_COMMA:
        text = text.replace(",", "\0").replace(".", ",").replace("\0", ".")
    return text


def hours(value: float, locale: str | None = None) -> str:
    """Hours as the epic plan writes them: ``3.5`` → ``3,5`` (pt-BR, de-DE) / ``3.5`` (en-US);
    ``19.0`` → ``19``. Two decimals at most, no grouping — the pt-BR output is exactly the
    historical ``fmt_hours``."""
    text = f"{round(float(value), 2):.2f}".rstrip("0").rstrip(".")
    return text.replace(".", ",") if _locale(locale) in _DECIMAL_COMMA else text
