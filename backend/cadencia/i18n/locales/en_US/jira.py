"""Jira errors: each kind's cause and action, and the HTTP client's messages.

``detail`` is Jira's own answer and ``path`` a REST path: both are passed through untranslated.
"""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    # JiraError and its subclasses: `<code>.cause` / `<code>.action`.
    "error.cause": "unexpected error while talking to Jira",
    "error.action": "Try again; if it keeps happening, check the collection log.",
    "auth.cause": "invalid credential",
    "auth.action": (
        "Check the e-mail address and create a new API token "
        "at id.atlassian.com."  # i18n: out of scope (domain name)
    ),
    "permission.cause": "no permission",
    "permission.action": (
        "Ask for read access to the project or board "
        "for the account Cadência uses."  # i18n: out of scope (product name)
    ),
    "not_found.cause": "resource not found",
    "not_found.action": "Check that the board, sprint or item still exists and that the account can see it.",
    "host.cause": "host unreachable or wrong",
    "host.action": "Check the instance URL, for example https://company.atlassian.net.",
    "query.cause": "invalid JQL query",
    "query.action": "Review the JQL; the /search/jql endpoint does not validate the query on its own.",
    "rate_limit.cause": "Jira request limit reached",
    "rate_limit.action": "Wait a few minutes or lower CADENCIA_JIRA_MAX_CONCURRENCY.",
    "server.cause": "Jira internal error",
    "server.action": "Jira answered with an error; try again in a few minutes.",
    "write_forbidden.cause": "write operation blocked",
    "write_forbidden.action": (
        "Cadência is read-only; no write call is allowed."  # i18n: out of scope (product name)
    ),
    # The client's messages.
    "message.no_base_url": "Jira instance URL not configured",
    "message.no_credentials": "E-mail address or API token missing",
    "message.write_blocked": (
        "{method} {path} blocked: Cadência is read-only"  # i18n: out of scope (product name)
    ),
    "message.timeout": "Timed out calling {path}",
    "message.connect": "Could not connect to {url} ({error})",
    "message.not_json": "Non-JSON response at {path}: the address does not look like a Jira",
    "message.redirect": "{path} redirected to {location}",
    "message.rate_limited": "HTTP 429 at {path}",
    "message.http": "HTTP {status} at {path}: {detail}",
    "message.auth": "Jira refused the credential (HTTP 401): {detail}",
    "message.permission": "No permission for {path} (HTTP 403): {detail}",
    "message.not_found": "{path} not found (HTTP 404): {detail}",
    "message.query": "JQL rejected: {detail}",
}
