"""Why the AI narrative draft (report/narrative.py) could not be written. The prompt itself is not
here: it asks for the deck's language and stays as it is."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "disabled": "AI suggestions are turned off (CADENCIA_AI_ENABLED).",
    "package_missing": "The anthropic package is not installed in the backend.",
    "key_refused": "The Anthropic API key was refused.",
    "rate_limited": "API usage limit reached; try again in a moment.",
    "status_error": "The API answered with error {status}.",
    "unreachable": "Could not reach the Anthropic API.",
    "refused": "The AI declined to write this text; write it by hand.",
    "empty": "The AI returned no text.",
}
