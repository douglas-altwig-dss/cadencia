"""Outbound messages: a deck was generated, the weekly risk digest, a collection failed (RF-71, RF-73).

Channels are configured once, in the app, and each one says which events it wants. Slack and Teams
take an incoming-webhook URL; ``webhook`` posts a small JSON document anywhere; ``email`` goes out
through the SMTP server in the settings. The Jira client's write guard is untouched — none of this
ever talks to Jira.

A webhook URL is a credential (whoever has it can post to the channel), so it is stored whole but
only ever shown masked, and every one is registered for log redaction.
"""

from __future__ import annotations

import logging
import smtplib
import uuid
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from email.message import EmailMessage
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from cadencia.config import Settings
from cadencia.i18n import STORAGE_LOCALE, Msg, localize, render, stored_text, tr, using_locale
from cadencia.i18n.fmt import day_month
from cadencia.logging import log_event, register_secret
from cadencia.store import repo

log = logging.getLogger(__name__)

CHANNELS_KEY = "notify.channels"
LAST_KEY = "notify.last"
DIGEST_KEY = "notify.digest"
Event = Literal["deck", "digest", "collection_failed"]
EVENTS: tuple[str, ...] = ("deck", "digest", "collection_failed")


def event_label(event: str) -> str:
    """The event's name for the settings screen, in the ambient language (``notify.event.<id>``)."""
    return tr(f"notify.event.{event}")


class Channel(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:10])
    name: str = ""
    kind: Literal["slack", "teams", "webhook", "email"]
    #: The webhook URL, or a comma-separated list of e-mail addresses.
    target: str
    events: list[Event] = Field(default_factory=lambda: ["deck", "digest"])
    enabled: bool = True

    @field_validator("target")
    @classmethod
    def _target(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("o destino não pode ficar vazio")  # i18n: out of scope
        return value

    def check(self) -> None:
        """What a validator cannot see alone: the target has to suit the kind."""
        from cadencia.errors import Invalid

        if self.kind == "email":
            bad = [a for a in _addresses(self.target) if "@" not in a]
            if bad or not _addresses(self.target):
                raise Invalid(Msg("notify.channel.bad_email", addresses=", ".join(bad) or self.target))
        elif not self.target.startswith(("https://", "http://")):
            raise Invalid(Msg("notify.channel.bad_url"))

    def masked(self) -> dict[str, Any]:
        data = self.model_dump()
        data["target"] = self.target if self.kind == "email" else mask(self.target)
        return data


class DigestSchedule(BaseModel):
    enabled: bool = False
    weekdays: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])
    hour: int = Field(9, ge=0, le=23)
    timezone: str = "America/Sao_Paulo"

    @field_validator("weekdays")
    @classmethod
    def _weekdays(cls, value: list[int]) -> list[int]:
        if not value or any(d < 0 or d > 6 for d in value):
            raise ValueError("dias da semana vão de 0 (segunda) a 6 (domingo)")  # i18n: out of scope
        return sorted(set(value))


def mask(url: str) -> str:
    """Enough to recognise the channel, not enough to post to it."""
    if len(url) <= 16:
        return "…"
    scheme, _, rest = url.partition("://")
    host = rest.split("/", 1)[0]
    return f"{scheme}://{host}/…{url[-4:]}"


def _addresses(target: str) -> list[str]:
    return [a.strip() for a in target.split(",") if a.strip()]


# ---------------------------------------------------------------- configuration


def channels(session: Session) -> list[Channel]:
    out = [Channel.model_validate(c) for c in repo.get_setting(session, CHANNELS_KEY, {}).get("items", [])]
    for channel in out:
        if channel.kind != "email":
            register_secret(channel.target)
    return out


def save_channels(session: Session, items: Sequence[Mapping[str, Any]]) -> list[Channel]:
    """Replace the channel list. A masked target sent back unchanged keeps the stored one."""
    stored = {c.id: c for c in channels(session)}
    saved: list[Channel] = []
    for raw in items:
        data = dict(raw)
        previous = stored.get(str(data.get("id") or ""))
        if previous is not None and data.get("target") in {None, "", previous.masked()["target"]}:
            data["target"] = previous.target
        channel = Channel.model_validate(data)
        channel.check()
        saved.append(channel)
    repo.set_setting(session, CHANNELS_KEY, {"items": [c.model_dump() for c in saved]})
    return saved


def digest_schedule(session: Session) -> DigestSchedule:
    return DigestSchedule.model_validate(repo.get_setting(session, DIGEST_KEY, {}) or {})


def save_digest_schedule(session: Session, schedule: DigestSchedule) -> None:
    repo.set_setting(session, DIGEST_KEY, schedule.model_dump())


def last_results(session: Session) -> dict[str, Any]:
    return dict(repo.get_setting(session, LAST_KEY, {}) or {})


def outcome_view(outcome: Mapping[str, Any] | None, locale: str | None = None) -> dict[str, Any] | None:
    """A delivery outcome for the screen: ``error`` in the reader's language (``locale``, default
    the ambient one) and the stored record left out. Outcomes saved before the record existed keep
    their stored text."""
    if outcome is None:
        return None
    view = {k: v for k, v in outcome.items() if k != "error_msg"}
    if "error" in outcome:
        view["error"] = stored_text(outcome.get("error_msg"), outcome.get("error"), locale)
    return view


# ---------------------------------------------------------------- messages

#: A message's text is a ``Msg`` (rendered in ``CADENCIA_LOCALE`` when it is sent) or plain text.
type Text = str | Msg


@dataclass
class Message:
    event: str
    title: Text
    text: Text
    link: str | None = None
    fields: dict[Text, Text] = field(default_factory=dict)
    #: #13: files an e-mail carries (name, bytes, MIME type). A webhook cannot carry a file, so
    #: Slack and Teams get the link instead — which is why the link is always set too.
    attachments: list[tuple[str, bytes, str]] = field(default_factory=list)

    def rendered(self) -> Message:
        """A copy whose texts are strings in the ambient language."""
        return replace(
            self,
            title=render(self.title),
            text=render(self.text),
            fields={render(k): render(v) for k, v in self.fields.items()},
        )

    def plain(self) -> str:
        parts = [render(self.text)]
        parts += [f"{render(k)}: {render(v)}" for k, v in self.fields.items()]
        if self.link:
            parts.append(self.link)
        return "\n".join(p for p in parts if p)


def payload(kind: str, message: Message) -> dict[str, Any]:
    """The body posted to a webhook, in the ambient language (``deliver`` pins ``CADENCIA_LOCALE``)."""
    message = message.rendered()
    if kind == "slack":
        link = f"\n<{message.link}|{tr('notify.open_in_app')}>" if message.link else ""
        facts = "".join(f"\n*{k}:* {v}" for k, v in message.fields.items())
        return {"text": f"*{message.title}*\n{message.text}{facts}{link}"}
    if kind == "teams":
        card: dict[str, Any] = {
            "@type": "MessageCard",
            "@context": "https://schema.org/extensions",
            "summary": message.title,
            "title": message.title,
            "text": str(message.text).replace("\n", "<br>"),
            "sections": [{"facts": [{"name": k, "value": v} for k, v in message.fields.items()]}],
        }
        if message.link:
            card["potentialAction"] = [
                {
                    "@type": "OpenUri",
                    "name": tr("notify.open_in_app"),
                    "targets": [{"os": "default", "uri": message.link}],
                }
            ]
        return card
    return {
        "event": message.event,
        "title": message.title,
        "text": message.text,
        "link": message.link,
        "fields": message.fields,
    }


class DeliveryError(Exception):
    """A channel refused or could not be reached; ``msg`` is stored so the screen can say why in
    whoever's language reads it."""

    def __init__(self, message: Msg) -> None:
        super().__init__(message)
        self.msg = message

    def __str__(self) -> str:
        return render(self.msg)


def _send_email(settings: Settings, to: list[str], message: Message) -> None:
    if not settings.smtp_host:
        raise DeliveryError(Msg("notify.error.smtp_missing"))
    message = message.rendered()
    email = EmailMessage()
    email["Subject"] = str(message.title)
    email["From"] = settings.smtp_from or settings.smtp_user or "cadencia@localhost"
    email["To"] = ", ".join(to)
    email.set_content(message.plain())
    for name, content, mime in message.attachments:
        maintype, _, subtype = mime.partition("/")
        email.add_attachment(content, maintype=maintype, subtype=subtype, filename=name)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
        if settings.smtp_starttls:
            server.starttls()
        password = settings.smtp_password.get_secret_value()
        if settings.smtp_user and password:
            server.login(settings.smtp_user, password)
        server.send_message(email)


def deliver(
    session: Session,
    settings: Settings,
    message: Message,
    *,
    only: Iterable[str] | None = None,
    transport: httpx.BaseTransport | None = None,
) -> list[dict[str, Any]]:
    """Send ``message`` to every enabled channel subscribed to its event (or to ``only``).

    A failing channel never stops the others and never raises: delivery is a side effect of work
    that already succeeded, so it reports rather than undoes. The outcome of each channel is kept
    for the settings screen.

    The message goes out in ``CADENCIA_LOCALE`` even when a request sent it: it lands in a team
    channel, not in front of the person who clicked (docs/i18n-backend.md, decision 1). The outcomes
    returned are for that person, so their ``error`` is in the caller's language.
    """
    wanted = set(only) if only is not None else None
    targets = [
        c
        for c in channels(session)
        if (c.id in wanted if wanted is not None else c.enabled and message.event in c.events)
    ]
    results: list[dict[str, Any]] = []
    last = last_results(session)
    with using_locale(settings.locale):
        outgoing = message.rendered()
        with httpx.Client(timeout=15, transport=transport) as client:
            for channel in targets:
                outcome: dict[str, Any] = {"channel": channel.id, "name": channel.name, "kind": channel.kind}
                try:
                    if channel.kind == "email":
                        _send_email(settings, _addresses(channel.target), outgoing)
                    else:
                        response = client.post(channel.target, json=payload(channel.kind, outgoing))
                        if response.status_code >= 300:
                            raise DeliveryError(
                                Msg(
                                    "notify.error.http",
                                    status=response.status_code,
                                    body=response.text[:120],
                                )
                            )
                    outcome["ok"] = True
                except Exception as exc:  # a channel down is a warning, not a failed generation
                    if isinstance(exc, DeliveryError):
                        outcome.update(
                            ok=False, error=render(exc.msg, STORAGE_LOCALE), error_msg=exc.msg.to_json()
                        )
                    else:  # the library's own words: kept as they are
                        outcome.update(ok=False, error=str(exc))
                    log_event(
                        log, "falha ao notificar", level=logging.WARNING, channel=channel.id, error=str(exc)
                    )
                outcome["at"] = datetime.now(UTC).isoformat()
                outcome["event"] = message.event
                last[channel.id] = outcome
                results.append(outcome)
    if results:
        repo.set_setting(session, LAST_KEY, last)
    return [view for view in (outcome_view(r) for r in results) if view is not None]


def app_link(settings: Settings, path: str) -> str | None:
    """An absolute link into the web app, when the public address is configured."""
    base = settings.public_url.rstrip("/")
    return f"{base}{path}" if base else None


def deck_message(settings: Settings, run: Any, template_name: str) -> Message:
    """Built from keys, so it is rendered in ``CADENCIA_LOCALE`` when it is sent."""
    ok = run.status == "ok"
    validation = run.validation or {}
    errors = len(validation.get("errors") or [])
    warnings = len(validation.get("warnings") or [])
    return Message(
        event="deck",
        title=Msg("notify.deck.title", name=template_name),
        text=Msg("notify.deck.approved") if ok else Msg("notify.deck.refused", errors=errors),
        link=app_link(settings, f"/presentation?template={run.template_id}&run={run.id}"),
        fields={
            Msg("notify.deck.field.reference"): Msg(
                "notify.deck.reference_at", at=run.reference_at.astimezone(UTC).isoformat()
            ),
            Msg("notify.deck.field.slides"): str(validation.get("slides", "—")),
            Msg("notify.deck.field.warnings"): str(warnings),
        },
    )


def send_digest(
    session: Session, settings: Settings, now: datetime, *, transport: httpx.BaseTransport | None = None
) -> dict[str, Any]:
    """One message per space with what became stalled, blocked or overdue (RF-73).

    A space with nothing new sends nothing: a digest that says "nada" every morning trains people to
    stop reading it. The text is written in ``CADENCIA_LOCALE`` whoever asked for it; the summary
    returned is in the caller's language.
    """
    from zoneinfo import ZoneInfo

    from cadencia.analytics.changes import digest, digest_text
    from cadencia.analytics.data import load_board

    defaults = repo.profile_defaults(settings)
    boards = [
        load_board(session, b.id, defaults, settings.history_days) for b in repo.selected_boards(session)
    ]
    zone = ZoneInfo(settings.timezone)

    def since(at: str) -> str:
        return day_month(datetime.fromisoformat(at).astimezone(zone), time=True)

    outgoing: list[tuple[dict[str, Any], int, Message]] = []
    with using_locale(settings.locale):
        report = digest(session, boards, now, settings.jira_base_url or None)
        for space in report["spaces"]:
            new = sum(len(b["new_risks"]) for b in space["boards"])
            if not new:
                continue
            message = Message(
                event="digest",
                title=Msg("notify.digest.title", space=render(space["space"]["name"]), count=new),
                text=digest_text(space, since),
                link=app_link(settings, "/"),
            )
            outgoing.append((space, new, message))
    sent = [
        {
            "space": localize(space["space"]),
            "new_risks": new,
            "results": deliver(session, settings, message, transport=transport),
        }
        for space, new, message in outgoing
    ]
    return {
        "generated_at": report["generated_at"],
        "total_new_risks": report["total_new_risks"],
        "sent": sent,
    }
