"""Generic texts: error causes, the API's 401/404/400/500 bodies, list endings."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    # NotFound's message when the raiser gives none.
    "not_found": "{subject} not found.",
    # `cause` of the API's error bodies.
    "error.not_found": "not found",
    "error.invalid": "invalid request",
    "error.internal.cause": "internal error",
    "error.internal.message": "{error} at {path}",
    "error.internal.action": "See the API log for the full traceback.",
    # 401 from TokenAuth.
    "auth.cause": "missing or invalid credential",
    "auth.message": "The API requires the token set in CADENCIA_API_TOKEN.",
    "auth.action": "Use the web interface (which signs in with a username and password) or send "
    "Authorization: Bearer <token>.",
    # fmt.listing: the end of a cut list.
    "listing.more": "{shown} and {more} more",
}
