"""FastAPI application factory. Run with ``uvicorn cadencia.api.app:create_app --factory``."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, sessionmaker

from cadencia import __version__
from cadencia.api import (
    routes_config,
    routes_deck,
    routes_epic_plan,
    routes_export,
    routes_focus_log,
    routes_home,
    routes_insights,
    routes_notify,
    routes_people,
    routes_planning,
    routes_reports,
    routes_setup,
    routes_views,
)
from cadencia.api.legacy import LegacyApiPaths
from cadencia.api.security import SecurityHeaders, TokenAuth
from cadencia.config import Settings, get_settings
from cadencia.config_store import effective_from
from cadencia.errors import Invalid, NotFound
from cadencia.i18n import Msg, configure_default_locale, render, using_locale
from cadencia.i18n.middleware import LocaleMiddleware, locale_of
from cadencia.jira.errors import JiraError
from cadencia.logging import configure_logging, register_secret
from cadencia.runtime import prepare_database
from cadencia.store.db import make_engine, make_session_factory

log = logging.getLogger(__name__)


def _startup_locale(settings: Settings, sessions: sessionmaker[Session]) -> str:
    """The saved language when the database answers, else the environment's."""
    try:
        return effective_from(settings, sessions).locale
    except Exception:
        log.warning("saved settings unreadable at startup; using the environment's", exc_info=True)
        return settings.locale


def create_app(settings: Settings | None = None, sessions: sessionmaker[Session] | None = None) -> FastAPI:
    # The environment's settings: the bootstrap fields, and the seed the values saved in the app are
    # laid over on every request (deps.settings_dep, docs/config-store.md).
    settings = settings or get_settings()
    if sessions is None:
        configure_logging(settings.log_level, settings.log_json)
        engine = make_engine(settings.database_url)
        prepare_database(settings, engine)
        sessions = make_session_factory(engine)
    # The language of what this process produces outside a request (scheduler jobs it starts).
    configure_default_locale(_startup_locale(settings, sessions))

    app = FastAPI(
        title="Cadência API",
        version=__version__,
        summary="Acompanhamento semanal de entregas no Jira. Somente leitura: nunca escreve no Jira.",
    )
    app.state.settings = settings
    app.state.sessions = sessions
    token = settings.api_token.get_secret_value()
    register_secret(token)
    # Last added runs first: CORS answers a preflight (which never carries credentials) before the
    # token check sees it, and both CORS and nosniff headers also reach a 401. The old Portuguese
    # paths redirect inside the token check, so only an authenticated caller learns the new path.
    app.add_middleware(LegacyApiPaths)
    app.add_middleware(TokenAuth, token=token)
    app.add_middleware(SecurityHeaders)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"]
    )
    # Outermost, so the token check's 401 and everything inside speak the request's language.
    app.add_middleware(LocaleMiddleware)

    # Every handler reads the locale from the request rather than from the contextvar: the
    # catch-all one runs in ServerErrorMiddleware, outside LocaleMiddleware, after it has reset.

    @app.exception_handler(JiraError)
    async def jira_error(request: Request, exc: JiraError) -> JSONResponse:
        with using_locale(locale_of(request)):
            detail = exc.as_dict()
        return JSONResponse(status_code=502, content={"detail": detail})

    # Only the errors that mean "not found" or "invalid" are explained to the user. A bare
    # KeyError/ValueError is a bug, and answering it with 404/400 is what used to hide one.
    @app.exception_handler(NotFound)
    async def not_found(request: Request, exc: NotFound) -> JSONResponse:
        locale = locale_of(request)
        return JSONResponse(
            status_code=404,
            content={
                "detail": {
                    "cause": render(Msg("common.error.not_found"), locale),
                    "message": render(exc.msg, locale),
                }
            },
        )

    @app.exception_handler(Invalid)
    async def bad_request(request: Request, exc: Invalid) -> JSONResponse:
        locale = locale_of(request)
        detail = {
            "cause": render(Msg("common.error.invalid"), locale),
            "message": render(exc.msg, locale),
        }
        if exc.field is not None:
            detail["field"] = exc.field
        return JSONResponse(status_code=400, content={"detail": detail})

    @app.exception_handler(Exception)
    async def internal_error(request: Request, exc: Exception) -> JSONResponse:
        log.error(
            "erro inesperado na API",
            exc_info=exc,
            extra={"fields": {"method": request.method, "path": request.url.path}},
        )
        locale = locale_of(request)
        message = Msg("common.error.internal.message", error=type(exc).__name__, path=request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "detail": {
                    "cause": render(Msg("common.error.internal.cause"), locale),
                    "message": render(message, locale),
                    "action": render(Msg("common.error.internal.action"), locale),
                }
            },
            headers={"Content-Language": locale, "Vary": "Accept-Language"},
        )

    for module in (
        routes_setup,
        routes_config,
        # Before routes_views: /people/overview must not be read as /people/{account_id}.
        routes_people,
        routes_views,
        routes_planning,
        routes_reports,
        routes_export,
        routes_insights,
        routes_notify,
        routes_epic_plan,
        routes_deck,
        routes_home,
        routes_focus_log,
    ):
        app.include_router(module.router, prefix="/api")
    app.include_router(routes_deck.public_router, prefix="/api")
    return app
