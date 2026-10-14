"""Delivery channels and the risk digest's schedule (RF-71, RF-73)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from cadencia import notify
from cadencia.api.deps import JSONDict, Now, SessionDep, SettingsDep
from cadencia.errors import NotFound
from cadencia.i18n import Msg, localize

router = APIRouter(prefix="/notifications", tags=["notificações"])


def _view(session: SessionDep, settings: SettingsDep) -> JSONDict:
    last = notify.last_results(session)
    return {
        "channels": [
            {**c.masked(), "last": notify.outcome_view(last.get(c.id))} for c in notify.channels(session)
        ],
        "digest": notify.digest_schedule(session).model_dump(),
        "events": [{"id": e, "label": notify.event_label(e)} for e in notify.EVENTS],
        "smtp_configured": bool(settings.smtp_host),
        "public_url": settings.public_url or None,
    }


@router.get("")
def read(session: SessionDep, settings: SettingsDep) -> JSONDict:
    return _view(session, settings)


class ChannelsBody(BaseModel):
    channels: list[dict[str, Any]]


@router.put("/channels")
def write_channels(body: ChannelsBody, session: SessionDep, settings: SettingsDep) -> JSONDict:
    notify.save_channels(session, body.channels)
    return _view(session, settings)


@router.put("/digest")
def write_digest(body: notify.DigestSchedule, session: SessionDep, settings: SettingsDep) -> JSONDict:
    notify.save_digest_schedule(session, body)
    return _view(session, settings)


@router.post("/channels/{channel_id}/test")
def test_channel(channel_id: str, session: SessionDep, settings: SettingsDep) -> JSONDict:
    if channel_id not in {c.id for c in notify.channels(session)}:
        raise NotFound(channel_id, Msg("notify.channel.not_found", id=channel_id))
    # Keys, not text: the test goes out in CADENCIA_LOCALE, like every message to a team channel.
    message = notify.Message(
        event="deck",
        title=Msg("notify.test.title"),
        text=Msg("notify.test.text"),
        link=notify.app_link(settings, "/"),
    )
    results = notify.deliver(session, settings, message, only=[channel_id])
    return {"result": results[0] if results else None}


@router.post("/digest/send")
def send_digest_now(session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    return localize(notify.send_digest(session, settings, now))
