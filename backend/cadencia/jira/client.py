"""Async, read-only Jira Cloud client.

- One ``httpx.AsyncClient`` (connection reuse) behind a semaphore (bounded concurrency).
- HTTP 429/5xx: honours ``Retry-After``, exponential backoff with jitter, capped attempts.
- Write guard: only GET, plus POST to the read-only search endpoints, can leave this module.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import random
from collections import Counter
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from tenacity import AsyncRetrying, RetryCallState, retry_if_exception_type, stop_after_attempt

from cadencia.jira.errors import (
    JiraAuthError,
    JiraError,
    JiraHostError,
    JiraNotFoundError,
    JiraPermissionError,
    JiraQueryError,
    JiraRateLimitError,
    JiraServerError,
    JiraWriteForbidden,
)
from cadencia.logging import log_event, register_secret

log = logging.getLogger(__name__)

SEARCH_JQL = "/rest/api/3/search/jql"
APPROXIMATE_COUNT = "/rest/api/3/search/approximate-count"
_READ_ONLY_POSTS = frozenset({SEARCH_JQL, APPROXIMATE_COUNT})
_RETRYABLE = frozenset({429, 500, 502, 503, 504})
SEARCH_PAGE_SIZE = 100
AGILE_PAGE_SIZE = 50
CHANGELOG_PAGE_SIZE = 100


@dataclass
class ClientCounters:
    calls: int = 0
    retries: int = 0
    rate_limit_waits: int = 0
    errors: Counter[str] = field(default_factory=Counter)

    def as_dict(self) -> dict[str, Any]:
        return {
            "calls": self.calls,
            "retries": self.retries,
            "rate_limit_waits": self.rate_limit_waits,
            "errors": dict(self.errors),
        }


class _Retry(Exception):
    """Internal signal: the wrapped error may succeed on a later attempt."""

    def __init__(self, error: JiraError, retry_after: float | None = None) -> None:
        super().__init__(error.message)
        self.error = error
        self.retry_after = retry_after


def _retry_after_seconds(response: httpx.Response) -> float | None:
    raw = response.headers.get("Retry-After")
    if raw is None:
        return None
    try:
        return max(0.0, float(raw))
    except ValueError:
        try:
            return max(0.0, (parsedate_to_datetime(raw) - datetime.now(UTC)).total_seconds())
        except (TypeError, ValueError):
            return None


def _error_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:200].strip() or response.reason_phrase
    if not isinstance(body, dict):
        return str(body)[:200]
    parts = [str(m) for m in body.get("errorMessages") or []]
    errors = body.get("errors")
    if isinstance(errors, dict):
        parts += [f"{k}: {v}" for k, v in errors.items()]
    if not parts and body.get("message"):
        parts.append(str(body["message"]))
    return "; ".join(parts) or response.reason_phrase


class JiraClient:
    def __init__(
        self,
        base_url: str,
        email: str,
        api_token: str,
        *,
        max_concurrency: int = 8,
        max_retries: int = 6,
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        rng: random.Random | None = None,
        max_backoff: float = 60.0,
    ) -> None:
        if not base_url:
            raise JiraHostError("URL da instância do Jira não configurada")
        if not email or not api_token:
            raise JiraAuthError("E-mail ou token de API ausente")
        credential = base64.b64encode(f"{email}:{api_token}".encode()).decode()
        register_secret(api_token)
        register_secret(credential)
        self.base_url = base_url.rstrip("/")
        self.max_retries = max(1, max_retries)
        self.max_backoff = max_backoff
        self.counters = ClientCounters()
        self._sleep = sleep
        self._rng = rng or random.Random()
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._http = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Basic {credential}", "Accept": "application/json"},
            timeout=timeout,
            transport=transport,
            limits=httpx.Limits(max_connections=max_concurrency, max_keepalive_connections=max_concurrency),
        )

    @classmethod
    def from_settings(cls, settings: Any, **kwargs: Any) -> JiraClient:
        options: dict[str, Any] = {
            "max_concurrency": settings.jira_max_concurrency,
            "max_retries": settings.jira_max_retries,
            "timeout": settings.jira_timeout_seconds,
        }
        options.update(kwargs)
        return cls(
            settings.jira_base_url,
            settings.jira_email,
            settings.jira_api_token.get_secret_value(),
            **options,
        )

    async def __aenter__(self) -> JiraClient:
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()

    # ------------------------------------------------------------------ transport

    @staticmethod
    def _check_read_only(method: str, path: str) -> None:
        if method == "GET" or (method == "POST" and path in _READ_ONLY_POSTS):
            return
        raise JiraWriteForbidden(f"{method} {path} bloqueado: a Cadência é somente leitura")

    def _wait_seconds(self, state: RetryCallState) -> float:
        exc = state.outcome.exception() if state.outcome else None
        backoff = min(self.max_backoff, 0.5 * 2 ** (state.attempt_number - 1))
        if isinstance(exc, _Retry) and exc.retry_after is not None:
            # Atlassian: wait what the API asked for, then add jitter so clients spread out.
            return exc.retry_after + self._rng.uniform(0, min(backoff, 5.0))
        return self._rng.uniform(backoff / 2, backoff)

    def _before_sleep(self, state: RetryCallState) -> None:
        self.counters.retries += 1
        exc = state.outcome.exception() if state.outcome else None
        error = exc.error if isinstance(exc, _Retry) else exc
        log_event(
            log,
            "nova tentativa de chamada ao Jira",
            level=logging.WARNING,
            attempt=state.attempt_number,
            cause=getattr(error, "cause", str(error)),
            wait_s=round(state.next_action.sleep, 2) if state.next_action else None,
        )

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        method = method.upper()
        self._check_read_only(method, path)
        retrying = AsyncRetrying(
            retry=retry_if_exception_type(_Retry),
            stop=stop_after_attempt(self.max_retries),
            wait=self._wait_seconds,
            sleep=self._sleep,
            before_sleep=self._before_sleep,
            reraise=True,
        )
        result: Any = None
        try:
            async for attempt in retrying:
                with attempt:
                    result = await self._send(method, path, params, json)
        except _Retry as exc:
            self.counters.errors[type(exc.error).__name__] += 1
            raise exc.error from None
        except JiraError as exc:
            self.counters.errors[type(exc).__name__] += 1
            raise
        return result

    async def _send(
        self, method: str, path: str, params: dict[str, Any] | None, json: dict[str, Any] | None
    ) -> Any:
        async with self._semaphore:
            self.counters.calls += 1
            try:
                response = await self._http.request(method, path, params=params, json=json)
            except httpx.TimeoutException as exc:
                raise _Retry(JiraHostError(f"Tempo esgotado ao chamar {path}")) from exc
            except httpx.TransportError as exc:
                raise _Retry(
                    JiraHostError(f"Não foi possível conectar a {self.base_url} ({type(exc).__name__})")
                ) from exc

        status = response.status_code
        if status < 300:
            if not response.content:
                return {}
            try:
                return response.json()
            except ValueError as exc:
                raise JiraHostError(
                    f"Resposta não-JSON em {path}: o endereço não parece ser um Jira",
                    status=status,
                ) from exc
        if status < 400:
            location = response.headers.get("Location", "?")
            raise JiraHostError(f"{path} redirecionou para {location}", status=status)
        if status in _RETRYABLE:
            if status == 429:
                self.counters.rate_limit_waits += 1
                error: JiraError = JiraRateLimitError(f"HTTP 429 em {path}", status=status)
            else:
                error = JiraServerError(f"HTTP {status} em {path}: {_error_detail(response)}", status=status)
            raise _Retry(error, _retry_after_seconds(response))
        raise self._error_for(response, path)

    @staticmethod
    def _error_for(response: httpx.Response, path: str) -> JiraError:
        status = response.status_code
        detail = _error_detail(response)
        if status == 401:
            return JiraAuthError(f"O Jira recusou a credencial (HTTP 401): {detail}", status=status)
        if status == 403:
            return JiraPermissionError(f"Sem permissão para {path} (HTTP 403): {detail}", status=status)
        if status == 404:
            return JiraNotFoundError(f"{path} não encontrado (HTTP 404): {detail}", status=status)
        if status == 400 and path in _READ_ONLY_POSTS:
            return JiraQueryError(f"JQL rejeitado: {detail}", status=status)
        return JiraError(f"HTTP {status} em {path}: {detail}", status=status)

    # ------------------------------------------------------------------ pagination

    async def _paginate_offset(
        self,
        path: str,
        *,
        items_key: str = "values",
        params: dict[str, Any] | None = None,
        page_size: int = AGILE_PAGE_SIZE,
    ) -> AsyncIterator[dict[str, Any]]:
        start = 0
        while True:
            page = await self.request(
                "GET", path, params={**(params or {}), "startAt": start, "maxResults": page_size}
            )
            items = page.get(items_key) or []
            for item in items:
                yield item
            start += len(items)
            if not items or page.get("isLast") is True:
                return
            total = page.get("total")
            if total is not None and start >= total:
                return
            if page.get("isLast") is None and total is None and len(items) < page_size:
                return

    async def _paginate_token(
        self, path: str, body: dict[str, Any], *, items_key: str = "issues"
    ) -> AsyncIterator[dict[str, Any]]:
        token: str | None = None
        while True:
            payload = dict(body)
            if token:
                payload["nextPageToken"] = token
            page = await self.request("POST", path, json=payload)
            for item in page.get(items_key) or []:
                yield item
            token = page.get("nextPageToken")
            if not token or page.get("isLast") is True:
                return

    # ------------------------------------------------------------------ endpoints

    async def myself(self) -> dict[str, Any]:
        return await self.request("GET", "/rest/api/3/myself")

    async def my_permissions(self, keys: Sequence[str] = ("BROWSE_PROJECTS",)) -> dict[str, bool]:
        data = await self.request("GET", "/rest/api/3/mypermissions", params={"permissions": ",".join(keys)})
        perms = data.get("permissions") or {}
        return {key: bool((perms.get(key) or {}).get("havePermission")) for key in keys}

    async def fields(self) -> list[dict[str, Any]]:
        return await self.request("GET", "/rest/api/3/field")

    async def statuses(self) -> list[dict[str, Any]]:
        return await self.request("GET", "/rest/api/3/status")

    async def boards(self) -> list[dict[str, Any]]:
        return [b async for b in self._paginate_offset("/rest/agile/1.0/board")]

    async def board_configuration(self, board_id: int) -> dict[str, Any]:
        return await self.request("GET", f"/rest/agile/1.0/board/{board_id}/configuration")

    async def sprints(self, board_id: int, states: str = "active,future,closed") -> list[dict[str, Any]]:
        try:
            return [
                s
                async for s in self._paginate_offset(
                    f"/rest/agile/1.0/board/{board_id}/sprint", params={"state": states}
                )
            ]
        except JiraError as exc:
            if exc.status == 400:  # kanban boards answer "board does not support sprints"
                return []
            raise

    async def sprint_issues(
        self, sprint_id: int, fields: Sequence[str], jql: str | None = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"fields": ",".join(fields)}
        if jql:
            params["jql"] = jql
        return [
            i
            async for i in self._paginate_offset(
                f"/rest/agile/1.0/sprint/{sprint_id}/issue",
                items_key="issues",
                params=params,
                page_size=SEARCH_PAGE_SIZE,
            )
        ]

    async def board_issues(
        self, board_id: int, fields: Sequence[str], jql: str | None = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"fields": ",".join(fields)}
        if jql:
            params["jql"] = jql
        return [
            i
            async for i in self._paginate_offset(
                f"/rest/agile/1.0/board/{board_id}/issue",
                items_key="issues",
                params=params,
                page_size=SEARCH_PAGE_SIZE,
            )
        ]

    async def search(self, jql: str, fields: Sequence[str]) -> list[dict[str, Any]]:
        body = {"jql": jql, "fields": list(fields), "maxResults": SEARCH_PAGE_SIZE}
        return [i async for i in self._paginate_token(SEARCH_JQL, body)]

    async def approximate_count(self, jql: str) -> int:
        data = await self.request("POST", APPROXIMATE_COUNT, json={"jql": jql})
        return int(data.get("count", 0))

    async def changelog(self, issue_key: str) -> list[dict[str, Any]]:
        return [
            h
            async for h in self._paginate_offset(
                f"/rest/api/3/issue/{issue_key}/changelog", page_size=CHANGELOG_PAGE_SIZE
            )
        ]
