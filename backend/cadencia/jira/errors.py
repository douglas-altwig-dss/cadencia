"""Jira errors that carry a human cause and a suggested action (RF-01, RF-35).

Each class names a catalogue ``code`` (``jira.auth``…); ``cause`` and ``action`` render
``<code>.cause`` / ``<code>.action`` in the ambient locale, and ``message`` renders the ``Msg`` the
raiser built (its parameters carry the path, the status and Jira's own answer, which is never
translated). ``record()`` is the same three as ``$msg`` JSON, for storing a failure so it can be
shown later in whoever's language reads it (docs/i18n-backend.md, 2.7).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from cadencia.i18n import Msg, render


def error_record(cause: Msg, action: Msg, message: Msg | str) -> dict[str, Any]:
    """``{"cause", "action", "message"}`` ready to store: each a ``$msg`` record, except a
    ``message`` that is already text (an unexpected exception's own words), kept as it is."""
    return {
        "cause": cause.to_json(),
        "action": action.to_json(),
        "message": message.to_json() if isinstance(message, Msg) else message,
    }


def record_text(record: Mapping[str, Any], locale: str | None = None) -> dict[str, str]:
    """A stored record's three texts in ``locale`` (default: the ambient one)."""
    return {name: render(record.get(name), locale) for name in ("cause", "action", "message")}


class JiraError(Exception):
    code = "jira.error"

    def __init__(self, message: str | Msg, *, status: int | None = None, details: Any = None) -> None:
        super().__init__(message)
        self.msg: str | Msg = message
        self.status = status
        self.details = details

    @property
    def cause(self) -> str:
        return render(Msg(f"{self.code}.cause"))

    @property
    def action(self) -> str:
        return render(Msg(f"{self.code}.action"))

    @property
    def message(self) -> str:
        return render(self.msg)

    def __str__(self) -> str:
        return self.message

    def record(self) -> dict[str, Any]:
        """What the collector stores for a failed board: rendered again by every reader."""
        return error_record(Msg(f"{self.code}.cause"), Msg(f"{self.code}.action"), self.msg)

    def as_dict(self) -> dict[str, Any]:
        return {
            "error": type(self).__name__,
            "cause": self.cause,
            "action": self.action,
            "message": self.message,
            "status": self.status,
        }


class JiraAuthError(JiraError):
    code = "jira.auth"


class JiraPermissionError(JiraError):
    code = "jira.permission"


class JiraNotFoundError(JiraError):
    code = "jira.not_found"


class JiraHostError(JiraError):
    code = "jira.host"


class JiraQueryError(JiraError):
    code = "jira.query"


class JiraRateLimitError(JiraError):
    code = "jira.rate_limit"


class JiraServerError(JiraError):
    code = "jira.server"


class JiraWriteForbidden(JiraError):
    code = "jira.write_forbidden"
