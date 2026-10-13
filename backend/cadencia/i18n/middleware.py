"""The request's language, set for everything that runs inside the request.

Pure ASGI, like ``api/security.py``: ``BaseHTTPMiddleware`` wraps the response stream and has a
history of interfering with background tasks. The contextvar set here is visible to sync routes
(they run in a worker thread with a copy of the context), dependencies, background tasks and the
exception handlers registered for specific types. It is **not** visible to the catch-all
``Exception`` handler, which Starlette runs in ``ServerErrorMiddleware`` outside every user
middleware — so the handlers in ``api/app.py`` ask :func:`locale_of` instead.
"""

from __future__ import annotations

from typing import Any

from starlette.datastructures import Headers, MutableHeaders, QueryParams
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from cadencia.i18n.runtime import _LOCALE, negotiate

#: The query parameter that wins over the header, for links the browser opens by itself (exports),
#: which carry the browser's own ``Accept-Language`` rather than the app's.
QUERY_PARAM = "lang"


def choose_locale(lang: str | None, accept_language: str | None) -> str:
    """``?lang=`` when given (and not empty), else ``Accept-Language``; negotiated either way."""
    return negotiate(lang if lang else accept_language)


def locale_of(request: Any) -> str:
    """The locale a request asked for; anything with ``query_params`` and ``headers`` will do."""
    return choose_locale(request.query_params.get(QUERY_PARAM), request.headers.get("accept-language"))


class LocaleMiddleware:
    """Sets the request locale for the duration of the request and says so in the response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        locale = choose_locale(
            QueryParams(scope.get("query_string", b"")).get(QUERY_PARAM),
            Headers(scope=scope).get("accept-language"),
        )
        scope.setdefault("state", {})["locale"] = locale

        async def send_with_language(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Content-Language"] = locale
                headers.add_vary_header("Accept-Language")
            await send(message)

        token = _LOCALE.set(locale)
        try:
            await self.app(scope, receive, send_with_language)
        finally:
            _LOCALE.reset(token)
