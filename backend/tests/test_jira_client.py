import json

import httpx
import pytest

from cadencia.jira.client import JiraClient
from cadencia.jira.errors import (
    JiraAuthError,
    JiraHostError,
    JiraPermissionError,
    JiraQueryError,
    JiraServerError,
    JiraWriteForbidden,
)
from cadencia.logging import redact

TOKEN = "secret-token-123"


@pytest.fixture
def sleeps():
    return []


def make(handler, sleeps, **kwargs):
    async def fake_sleep(seconds):
        sleeps.append(seconds)

    return JiraClient(
        "https://x.atlassian.net",
        "bot@example.com",
        TOKEN,
        transport=httpx.MockTransport(handler),
        sleep=fake_sleep,
        **kwargs,
    )


async def test_search_follows_next_page_token(sleeps):
    pages = [
        {"issues": [{"key": "A-1"}, {"key": "A-2"}], "nextPageToken": "t2"},
        {"issues": [{"key": "A-3"}], "isLast": True},
    ]
    tokens = []

    def handler(request):
        assert request.url.path == "/rest/api/3/search/jql"
        tokens.append(json.loads(request.content).get("nextPageToken"))
        return httpx.Response(200, json=pages[len(tokens) - 1])

    async with make(handler, sleeps) as client:
        issues = await client.search("project = A", ["summary"])
    assert [i["key"] for i in issues] == ["A-1", "A-2", "A-3"]
    assert tokens == [None, "t2"]


async def test_offset_pagination_stops_on_is_last(sleeps):
    starts = []

    def handler(request):
        start = int(request.url.params["startAt"])
        starts.append(start)
        if start == 0:
            return httpx.Response(200, json={"values": [{"id": 1}, {"id": 2}], "isLast": False})
        return httpx.Response(200, json={"values": [{"id": 3}], "isLast": True})

    async with make(handler, sleeps) as client:
        boards = await client.boards()
    assert [b["id"] for b in boards] == [1, 2, 3]
    assert starts == [0, 2]


async def test_rate_limit_honours_retry_after(sleeps):
    responses = iter(
        [httpx.Response(429, headers={"Retry-After": "3"}), httpx.Response(200, json={"accountId": "me"})]
    )
    async with make(lambda _r: next(responses), sleeps) as client:
        me = await client.myself()
        counters = client.counters.as_dict()
    assert me == {"accountId": "me"}
    assert sleeps and sleeps[0] >= 3
    assert counters["rate_limit_waits"] == 1 and counters["retries"] == 1


async def test_server_errors_give_up_after_max_retries(sleeps):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(503, json={"errorMessages": ["indisponível"]})

    async with make(handler, sleeps, max_retries=3) as client:
        with pytest.raises(JiraServerError):
            await client.fields()
    assert len(calls) == 3
    assert len(sleeps) == 2
    assert sleeps[1] >= sleeps[0] / 2  # exponential with jitter


@pytest.mark.parametrize(
    ("status", "error", "cause"),
    [(401, JiraAuthError, "credencial inválida"), (403, JiraPermissionError, "sem permissão")],
)
async def test_auth_and_permission_errors_carry_cause(sleeps, status, error, cause):
    async with make(lambda _r: httpx.Response(status, json={"errorMessages": ["nope"]}), sleeps) as client:
        with pytest.raises(error) as info:
            await client.myself()
    assert info.value.cause == cause
    assert info.value.action


async def test_invalid_jql_is_reported_explicitly(sleeps):
    handler = lambda _r: httpx.Response(400, json={"errorMessages": ["Error in the JQL Query"]})  # noqa: E731
    async with make(handler, sleeps) as client:
        with pytest.raises(JiraQueryError, match="Error in the JQL Query"):
            await client.search("project ==", ["summary"])


async def test_writes_are_blocked_before_any_request(sleeps):
    def handler(_request):
        raise AssertionError("nenhuma requisição deveria sair")

    async with make(handler, sleeps) as client:
        with pytest.raises(JiraWriteForbidden):
            await client.request("PUT", "/rest/api/3/issue/A-1", json={"fields": {}})
        with pytest.raises(JiraWriteForbidden):
            await client.request("POST", "/rest/api/3/issue", json={})
        with pytest.raises(JiraWriteForbidden):
            await client.request("DELETE", "/rest/api/3/issue/A-1")


async def test_unreachable_host_is_a_host_error(sleeps):
    def handler(request):
        raise httpx.ConnectError("boom", request=request)

    async with make(handler, sleeps, max_retries=2) as client:
        with pytest.raises(JiraHostError) as info:
            await client.myself()
    assert info.value.cause == "host inacessível ou errado"


def test_token_and_basic_credential_are_redacted():
    make(lambda _r: httpx.Response(200), [])
    line = f"Authorization: Basic Ym90QGV4YW1wbGUuY29tOnNlY3JldA== token={TOKEN}"
    cleaned = redact(line)
    assert TOKEN not in cleaned
    assert "Ym90QGV4YW1wbGUuY29tOnNlY3JldA" not in cleaned
