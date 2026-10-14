"""Settings saved in the app: the configuration screen and its wizard (docs/config-store.md)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from cadencia import config_store
from cadencia.api.deps import JSONDict, SessionDep, SessionsDep, SettingsDep
from cadencia.collector.service import run_connection_test
from cadencia.config import Settings
from cadencia.errors import Invalid
from cadencia.i18n import Msg, configure_default_locale, render
from cadencia.jira.errors import JiraError
from cadencia.logging import register_secret

router = APIRouter(tags=["settings"])


def _base(request: Request) -> Settings:
    """The environment's settings: the seed every saved value is laid over."""
    return request.app.state.settings


def _answer(request: Request, session: Any) -> JSONDict:
    base = _base(request)
    view = config_store.view(base, session)
    # What this process says outside a request (the jobs it starts) follows a saved language too.
    configure_default_locale(config_store.effective_settings(base, session).locale)
    return view


@router.get("/config")
def get_config(request: Request, session: SessionDep) -> JSONDict:
    return config_store.view(_base(request), session)


class ConfigUpdate(BaseModel):
    values: dict[str, Any]


@router.put("/config")
def put_config(body: ConfigUpdate, request: Request, session: SessionDep) -> JSONDict:
    config_store.update(_base(request), session, body.values)
    return _answer(request, session)


@router.delete("/config/{key}")
def delete_config(key: str, request: Request, session: SessionDep) -> JSONDict:
    config_store.forget(session, key)
    return _answer(request, session)


@router.post("/config/import-env")
def import_env(request: Request, session: SessionDep) -> JSONDict:
    imported = config_store.import_env(_base(request), session)
    return {**_answer(request, session), "imported": imported}


class JiraDraft(BaseModel):
    jira_base_url: str | None = None
    jira_email: str | None = None
    jira_api_token: str | None = None


def _error(cause: Msg, message: Msg | str, action: Msg) -> JSONDict:
    error = {"cause": render(cause), "message": render(message), "action": render(action)}
    return {"ok": False, "error": error}


@router.post("/config/jira/test")
async def jira_test(body: JiraDraft, settings: SettingsDep, sessions: SessionsDep) -> JSONDict:
    """Test the connection with draft values laid over the effective ones. Nothing is saved."""
    draft: dict[str, Any] = {}
    if body.jira_base_url is not None:
        draft["jira_base_url"] = body.jira_base_url
    if body.jira_email is not None:
        draft["jira_email"] = body.jira_email
    if body.jira_api_token:  # omitted or empty: the token already configured
        draft["jira_api_token"] = body.jira_api_token
        register_secret(body.jira_api_token)
    try:
        for key, value in list(draft.items()):
            draft[key] = config_store.coerce(config_store.REGISTRY[key], value)
        candidate = config_store.draft(settings, draft)
    except Invalid as exc:
        return _error(Msg("config.jira_test.invalid.cause"), exc.msg, Msg("config.jira_test.invalid.action"))
    missing = [
        Msg(f"config.field.{key}")
        for key, value in (
            ("jira_base_url", candidate.jira_base_url),
            ("jira_email", candidate.jira_email),
            ("jira_api_token", candidate.jira_api_token.get_secret_value()),
        )
        if not value
    ]
    if missing:
        return _error(
            Msg("config.jira_test.missing.cause"),
            Msg("config.jira_test.missing.message", fields=missing),
            Msg("config.jira_test.missing.action"),
        )
    try:
        return await run_connection_test(candidate, sessions)
    except JiraError as exc:
        return {"ok": False, "error": exc.as_dict()}
