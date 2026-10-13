"""Which language is being spoken right now.

Inside an API request it is the request's (``LocaleMiddleware`` sets a contextvar); anywhere else —
CLI, scheduler threads, tests — it is the process default, which ``create_app`` and ``cli.main``
set from ``CADENCIA_LOCALE``. ``using_locale`` pins it for a block, which is how the deck's data is
always built in pt-BR whatever the request says (docs/i18n-backend.md, R5).
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

SUPPORTED: tuple[str, ...] = ("en-US", "pt-BR", "de-DE")
DEFAULT_LOCALE = "en-US"
#: The generated deck's language: it is filled into a pt-BR template and is not translated.
DECK_LOCALE = "pt-BR"
#: The language of the text mirrors kept beside stored ``$msg`` records (R4).
STORAGE_LOCALE = "pt-BR"

_BY_LOWER = {tag.lower(): tag for tag in SUPPORTED}
_BY_PRIMARY: dict[str, str] = {}
for _tag in SUPPORTED:
    _BY_PRIMARY.setdefault(_tag.split("-")[0].lower(), _tag)

#: The request's (or block's) locale; ``None`` means "use the process default".
_LOCALE: ContextVar[str | None] = ContextVar("cadencia_locale", default=None)
_default = DEFAULT_LOCALE

#: An ``Accept-Language`` longer than this is cut: nobody prefers forty languages.
_MAX_HEADER = 512


def canonical(locale: str) -> str:
    """``"pt_br"`` → ``"pt-BR"``. Only the supported tags, spelled any case, with ``-`` or ``_``;
    anything else raises ``ValueError`` (a programmer or configuration error, never user input —
    user input goes through :func:`negotiate`)."""
    found = _BY_LOWER.get(str(locale).strip().replace("_", "-").lower())
    if found is None:
        raise ValueError(f"unsupported locale {locale!r}; use one of {', '.join(SUPPORTED)}")
    return found


def current_locale() -> str:
    """The ambient locale: the contextvar when set, else the process default."""
    return _LOCALE.get() or _default


def configure_default_locale(locale: str) -> None:
    """Set the process default, used by code outside a request (CLI, scheduler threads)."""
    global _default
    _default = canonical(locale)


@contextmanager
def using_locale(locale: str) -> Iterator[None]:
    """Speak ``locale`` inside the block, in this thread or task only, then restore what was."""
    token = _LOCALE.set(canonical(locale))
    try:
        yield
    finally:
        _LOCALE.reset(token)


def _weight(params: list[str]) -> float | None:
    """The ``q`` of one ``Accept-Language`` entry; ``None`` when invalid or zero (skip it)."""
    for param in params:
        name, _, value = param.partition("=")
        if name.strip().lower() != "q":
            continue
        try:
            q = float(value.strip())
        except ValueError:
            return None
        return q if 0 < q <= 1 else None
    return 1.0


def negotiate(header: str | None) -> str:
    """An ``Accept-Language`` value (or a ``?lang=``) → the supported locale to answer in.

    Entries are read in order of ``q`` (ties keep their order; invalid or ``q=0`` entries are
    skipped, ``*`` is ignored). Each is matched on its full tag, case-insensitively, then on its
    primary subtag (``de`` → ``de-DE``, ``en-GB`` → ``en-US``). Nothing matches → ``en-US``.
    """
    if not header:
        return DEFAULT_LOCALE
    entries: list[tuple[float, str]] = []
    for part in header[:_MAX_HEADER].split(","):
        tag, *params = part.split(";")
        tag = tag.strip().replace("_", "-").lower()
        weight = _weight(params)
        if not tag or tag == "*" or weight is None:
            continue
        entries.append((weight, tag))
    entries.sort(key=lambda entry: -entry[0])  # stable: equal weights keep the header's order
    for _, tag in entries:
        if tag in _BY_LOWER:
            return _BY_LOWER[tag]
        primary = _BY_PRIMARY.get(tag.split("-")[0])
        if primary is not None:
            return primary
    return DEFAULT_LOCALE
