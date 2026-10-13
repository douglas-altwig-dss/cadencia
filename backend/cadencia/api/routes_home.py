"""The Home mosaic: each person's own arrangement of tiles, and the team pulse some tiles read."""

from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from cadencia.analytics.pulse import pulse
from cadencia.api.deps import JSONDict, Now, SessionDep, SettingsDep, author_of, csv_ints, selected_or
from cadencia.errors import Invalid
from cadencia.store import repo

router = APIRouter(tags=["painel"])

MAX_TILES = 40
MAX_CONFIG = 4_000  # characters of JSON per tile: a tile's own settings, not a place to keep data


def _key(request: Request) -> tuple[str, str | None]:
    """The setting a layout lives in, and who it belongs to. Without a signed-in user (development, or
    no proxy) there is one shared layout, and the answer says so."""
    user = author_of(request)
    return f"home.layout.{(user or '_')[:100]}", user


@router.get("/home/layout")
def get_layout(request: Request, session: SessionDep) -> JSONDict:
    key, user = _key(request)
    return {"layout": repo.get_setting(session, key), "user": user, "shared": user is None}


class TileBody(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    type: str = Field(min_length=1, max_length=64)
    size: Literal["P", "M", "G"] = "M"
    config: dict[str, Any] = Field(default_factory=dict)


class LayoutBody(BaseModel):
    version: int = 1
    tiles: list[TileBody] = Field(default_factory=list, max_length=MAX_TILES)


@router.put("/home/layout")
def put_layout(body: LayoutBody, request: Request, session: SessionDep) -> JSONDict:
    if len({t.id for t in body.tiles}) != len(body.tiles):
        raise Invalid("Dois tiles do painel têm o mesmo identificador.")
    for tile in body.tiles:
        if len(json.dumps(tile.config)) > MAX_CONFIG:
            raise Invalid(f"As configurações do tile {tile.type} são grandes demais.")
    key, user = _key(request)
    repo.set_setting(session, key, body.model_dump())
    return {"layout": body.model_dump(), "user": user, "shared": user is None}


@router.delete("/home/layout", status_code=204)
def reset_layout(request: Request, session: SessionDep) -> None:
    """Back to the default arrangement."""
    repo.delete_setting(session, _key(request)[0])


@router.get("/home/pulse")
def get_pulse(session: SessionDep, settings: SettingsDep, now: Now, board_id: str | None = None) -> JSONDict:
    return {"generated_at": now.isoformat(), **pulse(selected_or(session, settings, csv_ints(board_id)), now)}
