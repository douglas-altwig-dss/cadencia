"""Notifications: events, the messages sent to channels, and delivery failures.

Messages are rendered in CADENCIA_LOCALE (they go to a team channel); delivery failures and event
names in the reader's language.
"""

from __future__ import annotations

from cadencia.i18n.fmt import day_month_year, plural
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    # Event names on the settings screen.
    "event.deck": "deck generated",
    "event.digest": "risk digest",
    "event.collection_failed": "collection failed",
    # Channel checks.
    "channel.bad_email": "invalid e-mail address: {addresses}",
    "channel.bad_url": "a webhook target must be an HTTP or HTTPS URL",
    "channel.not_found": "Channel {id} does not exist.",
    # Slack/Teams link to the app.
    "open_in_app": "Open in Cadência",  # i18n: out of scope (product name)
    # Delivery failures (`body` is the channel's own answer).
    "error.smtp_missing": "SMTP not configured: set the mail server in Settings → E-mail & links",
    "error.http": "HTTP {status}: {body}",
    # A deck was generated.
    "deck.title": "Deck generated: {name}",
    "deck.approved": "Passed validation and ready to download.",
    "deck.refused": lambda errors: (
        f"Failed validation ({errors} {plural(errors, 'error', 'errors')}); open it to see what is missing."
    ),
    "deck.field.reference": "Reference",
    "deck.field.slides": "Slides",
    "deck.field.warnings": "Warnings",
    "deck.reference_at": lambda at: f"{day_month_year(at, 'en-US', time=True)} UTC",
    # The risk digest.
    "digest.title": "New risks — {space}: {count}",
    # A scheduled collection failed.
    "collection.failed": "Collection failed",
    "collection.partial": "Collection partly failed",
    "collection.failed_text": "The scheduled collection failed.",
    # "Send test" on a channel.
    "test.title": "Cadência test",  # i18n: out of scope (product name)
    "test.text": "If you are reading this, the channel is set up correctly.",
}

SAMPLES = {
    "deck.reference_at": {"at": "2026-09-08T15:00:00+00:00"},
}
