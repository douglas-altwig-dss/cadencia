"""Old Portuguese ``/api`` paths answer 308 to their English names (docs/routes.md).

Bookmarks, scripts and older clients still call ``/api/planejamento`` and friends. One table says
what each became; ``LegacyApiPaths`` turns a match into a permanent redirect that keeps the method,
the body (308, unlike 301, forbids changing either) and the query string. It sits inside
``TokenAuth``, so a caller without the token gets the 401 and learns nothing about the new path.
"""

from __future__ import annotations

import re
from urllib.parse import quote

from starlette.responses import RedirectResponse
from starlette.types import ASGIApp, Receive, Scope, Send

#: Old path → new path, in the notation of docs/routes.md. A ``{name}`` is one path segment and
#: is carried over unchanged.
LEGACY_API_PATHS: tuple[tuple[str, str], ...] = (
    ("/api/papeis", "/api/roles"),
    ("/api/papeis/{role_id}", "/api/roles/{role_id}"),
    ("/api/membros", "/api/members"),
    ("/api/membros/{account_id}", "/api/members/{account_id}"),
    ("/api/planejamento", "/api/planning"),
    ("/api/planejamento/parametros", "/api/planning/parameters"),
    ("/api/planejamento/algoritmos", "/api/planning/algorithms"),
    ("/api/epics/{key}/plano", "/api/epics/{key}/plan"),
    ("/api/epics/{key}/plano/selecao", "/api/epics/{key}/plan/selection"),
    ("/api/subtarefas/{key}/papeis", "/api/subtasks/{key}/roles"),
    ("/api/reports/templates/{id}/clonar-mapeamento", "/api/reports/templates/{id}/clone-mapping"),
    ("/api/reports/palette/acessivel", "/api/reports/palette/accessible"),
    ("/api/reports/runs/{id}/reassociar", "/api/reports/runs/{id}/reassociate"),
)

_PARAM = re.compile(r"\{(\w+)\}")


def _compile(old: str) -> re.Pattern[str]:
    parts = _PARAM.split(old)
    # split() alternates literal text and parameter names.
    pattern = "".join(re.escape(p) if i % 2 == 0 else f"(?P<{p}>[^/]+)" for i, p in enumerate(parts))
    return re.compile(f"{pattern}/?")


_RULES = tuple((_compile(old), new) for old, new in LEGACY_API_PATHS)


def english_api_path(path: str) -> str | None:
    """The new path for an old Portuguese one, or ``None`` when ``path`` is not an old one."""
    for pattern, new in _RULES:
        match = pattern.fullmatch(path)
        if match:
            return new.format(**match.groupdict())
    return None


class LegacyApiPaths:
    """Redirects an old API path with 308, keeping the query string."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            # The path as sent, so a segment such as an issue key travels still percent-encoded.
            raw = scope.get("raw_path")
            path = raw.decode("latin-1") if raw else quote(scope["path"])
            target = english_api_path(path)
            if target is not None:
                query = scope.get("query_string", b"").decode("latin-1")
                location = f"{target}?{query}" if query else target
                await RedirectResponse(location, status_code=308)(scope, receive, send)
                return
        await self.app(scope, receive, send)
