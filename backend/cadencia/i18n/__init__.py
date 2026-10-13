"""Backend internationalisation (docs/i18n.md is the contract, docs/i18n-backend.md the design).

``en-US`` is the default; ``pt-BR`` and ``de-DE`` are supported. Pure code builds :class:`Msg`
values; boundaries render them with :func:`tr`, :func:`render` and :func:`localize` in the ambient
locale — the request's inside a request, ``CADENCIA_LOCALE`` elsewhere, ``pt-BR`` while the deck's
data is built.

Importing this package does not load any catalogue: that happens on the first render.
``cadencia.i18n.middleware`` (Starlette) is not re-exported, so the CLI and pure code stay light.
"""

from cadencia.i18n.message import Msg, Param, msg
from cadencia.i18n.render import Entry, catalog, localize, render, stored_text, tr
from cadencia.i18n.runtime import (
    DECK_LOCALE,
    DEFAULT_LOCALE,
    STORAGE_LOCALE,
    SUPPORTED,
    configure_default_locale,
    current_locale,
    negotiate,
    using_locale,
)

__all__ = [
    "DECK_LOCALE",
    "DEFAULT_LOCALE",
    "STORAGE_LOCALE",
    "SUPPORTED",
    "Entry",
    "Msg",
    "Param",
    "catalog",
    "configure_default_locale",
    "current_locale",
    "localize",
    "msg",
    "negotiate",
    "render",
    "stored_text",
    "tr",
    "using_locale",
]
