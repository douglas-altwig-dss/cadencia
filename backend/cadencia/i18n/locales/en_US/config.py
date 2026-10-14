"""Settings saved in the app (docs/config-store.md): refusals and the connection test's answers."""

from __future__ import annotations

from cadencia.i18n.render import Entry


def _missing(fields: list[str]) -> str:
    return "Fill in before testing: " + ", ".join(fields) + "."


MESSAGES: dict[str, Entry] = {
    "error.unknown": "{key} is not a setting.",
    "error.bootstrap": (
        "{key} can only be set in the environment: it is needed before the database is reached."
    ),
    "error.int": "{key} must be a whole number from {min} to {max}.",
    "error.float": "{key} must be a number from {min} to {max}.",
    "error.weekday": "{key} must be a weekday from 0 (Monday) to 6 (Sunday).",
    "error.hour": "{key} must be an hour from 0 to 23.",
    "error.bool": "{key} must be true or false.",
    "error.string": "{key} must be text.",
    "error.url": "{key} must be an http or https address, such as https://company.atlassian.net.",
    "error.email": "{key} must be an e-mail address.",
    "error.timezone": "{value} is not a known time zone; use a name such as America/Sao_Paulo.",
    "error.locale": "{value} is not a supported language; use one of {supported}.",
    "error.refused": "{key} has a value that cannot be used.",
    "field.jira_base_url": "Jira address",
    "field.jira_email": "e-mail",
    "field.jira_api_token": "API token",
    "jira_test.missing.cause": "Jira connection incomplete",
    "jira_test.missing.message": _missing,
    "jira_test.missing.action": "Enter the Jira address, the e-mail and the API token, then test again.",
    "jira_test.invalid.cause": "Jira connection details refused",
    "jira_test.invalid.action": "Correct the value and test again.",
}
