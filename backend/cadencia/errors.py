"""Errors that are answers rather than bugs.

The API maps these two, and only these two, to 404 and 400. A bare ``KeyError`` or ``ValueError``
from anywhere else is a bug and surfaces as a logged 500: reporting it as "não encontrado" hid
real failures, a zoneinfo miss among them (``ZoneInfoNotFoundError`` is a ``KeyError``).

They subclass the builtins so code and tests that already catch ``KeyError``/``ValueError`` keep
working; what changed is only which of them the API is willing to explain to a user.

Both carry their text as ``msg`` — a :class:`~cadencia.i18n.message.Msg`, or a plain ``str`` from
code not converted yet — so pure code can raise them without knowing the reader's language. The
API's handlers render ``msg`` in the request's locale; ``str(exc)`` renders in the ambient one
(docs/i18n-backend.md, R6). Only ``cadencia.i18n.message`` is imported at load time, which keeps
this module importable from ``domain/`` and ``report/core/``.
"""

from __future__ import annotations

from cadencia.i18n.message import Msg


def _render(value: Msg | str) -> str:
    from cadencia.i18n.render import render  # lazy: the catalogue is boundary business

    return render(value) if isinstance(value, Msg | str) else str(value)


class NotFound(KeyError):
    """The thing asked for does not exist (HTTP 404)."""

    def __init__(self, subject: object, message: str | Msg | None = None) -> None:
        super().__init__(subject)
        self.subject = subject
        self.msg: Msg | str = message if message else Msg("common.not_found", subject=str(subject))

    @property
    def message(self) -> str:
        """``msg`` in the ambient locale."""
        return _render(self.msg)

    def __str__(self) -> str:  # KeyError's own repr-quotes its argument
        return self.message


class Invalid(ValueError):
    """The request is well formed but its content is refused (HTTP 400)."""

    def __init__(self, message: str | Msg, *, field: str | None = None) -> None:
        super().__init__(message)
        self.msg: Msg | str = message
        #: The input the refusal is about, when it is one (the API adds it to the 400's detail).
        self.field = field

    def __str__(self) -> str:
        return _render(self.msg)
