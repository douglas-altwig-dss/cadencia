"""Errors that are answers rather than bugs.

The API maps these two, and only these two, to 404 and 400. A bare ``KeyError`` or ``ValueError``
from anywhere else is a bug and surfaces as a logged 500: reporting it as "não encontrado" hid
real failures, a zoneinfo miss among them (``ZoneInfoNotFoundError`` is a ``KeyError``).

They subclass the builtins so code and tests that already catch ``KeyError``/``ValueError`` keep
working; what changed is only which of them the API is willing to explain to a user.
"""

from __future__ import annotations


class NotFound(KeyError):
    """The thing asked for does not exist (HTTP 404)."""

    def __init__(self, subject: object, message: str | None = None) -> None:
        super().__init__(subject)
        self.subject = subject
        self.message = message or f"{subject} não encontrado."

    def __str__(self) -> str:  # KeyError's own repr-quotes its argument
        return self.message


class Invalid(ValueError):
    """The request is well formed but its content is refused (HTTP 400)."""
