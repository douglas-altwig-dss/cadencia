"""Request guards: the API token and the headers every response carries.

Both are plain ASGI middleware rather than ``BaseHTTPMiddleware``, which wraps the response stream
and has a history of interfering with background tasks (``/collect`` runs in one).
"""

from __future__ import annotations

import hmac

from fastapi.responses import JSONResponse
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from cadencia.i18n import tr

#: Reachable without the token: a container health check has no credential to send.
PUBLIC_PATHS = frozenset({"/api/health"})
#: #14: what a read-only share link opens. Every route under it authenticates by the unguessable,
#: expiring token in its own path and serves one deck's scene, its pictures and font files — never
#: anything that lists, writes or reaches another deck.
PUBLIC_PREFIXES = ("/api/public/",)


class TokenAuth:
    """Every request needs ``Authorization: Bearer <CADENCIA_API_TOKEN>`` once a token is set.

    People never type it: nginx signs them in with a password and forwards the token (see the web
    image's entrypoint), and the Vite dev proxy does the same from the environment. An empty token
    leaves the API open, as it was, for local development. ``scope["state"]["authenticated"]``
    tells a public route whether it may say more than the minimum.
    """

    def __init__(self, app: ASGIApp, token: str) -> None:
        self.app = app
        self.token = token.encode()

    def _authenticated(self, scope: Scope) -> bool:
        if not self.token:
            return True
        scheme, _, credential = Headers(scope=scope).get("authorization", "").partition(" ")
        return scheme.lower() == "bearer" and hmac.compare_digest(credential.strip().encode(), self.token)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        authenticated = self._authenticated(scope)
        scope.setdefault("state", {})["authenticated"] = authenticated
        path = scope["path"]
        public = path in PUBLIC_PATHS or (path.startswith(PUBLIC_PREFIXES) and scope.get("method") == "GET")
        if authenticated or public:
            await self.app(scope, receive, send)
            return
        response = JSONResponse(
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
            # LocaleMiddleware wraps this one, so tr() speaks the request's language.
            content={
                "detail": {
                    "cause": tr("common.auth.cause"),
                    "message": tr("common.auth.message"),
                    "action": tr("common.auth.action"),
                }
            },
        )
        await response(scope, receive, send)


class SecurityHeaders:
    """``nosniff`` on every response, so nothing served here is ever reinterpreted as a page."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message).setdefault("X-Content-Type-Options", "nosniff")
            await send(message)

        await self.app(scope, receive, send_with_headers)
