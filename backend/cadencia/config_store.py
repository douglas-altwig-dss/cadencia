"""Runtime configuration saved in the database (docs/config-store.md is the contract).

The environment (``Settings``: ``CADENCIA_*``, ``.env``, ``/run/secrets``) is only the seed. The
runtime fields below can be saved in the app, under the single ``app_setting`` key
``config.values`` (``{field: value}``, secrets as ``{"$enc": "<fernet token>"}``), and a saved
value wins. :func:`effective_settings` lays the saved values over the environment and validates
the result with ``Settings``' own validators; every consumer reads that object at the moment it
runs. The bootstrap fields (database, data dir, API token, CORS, logging, the secret key) are
needed before the database can be reached, or guard the API itself, so they stay env-only.
"""

from __future__ import annotations

import json
import logging
import math
import os
import threading
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from cryptography.fernet import Fernet, InvalidToken
from pydantic import SecretStr, ValidationError
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from cadencia.config import Settings
from cadencia.errors import Invalid
from cadencia.i18n import Msg
from cadencia.i18n.runtime import SUPPORTED, canonical
from cadencia.logging import log_event, register_secret
from cadencia.store import repo
from cadencia.store.db import session_scope

log = logging.getLogger(__name__)

CONFIG_KEY = "config.values"
SECRET_FILE = "secret.key"
_ENC = "$enc"

Kind = Literal[
    "string", "url", "email", "secret", "int", "float", "bool", "timezone", "locale", "weekday", "hour"
]
Source = Literal["database", "environment", "default"]


@dataclass(frozen=True)
class FieldSpec:
    key: str
    group: str
    kind: Kind
    min: float | None = None
    max: float | None = None

    @property
    def secret(self) -> bool:
        return self.kind == "secret"


GROUPS: tuple[str, ...] = ("jira", "calendar", "collection", "notifications", "ai", "general")

FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec("jira_base_url", "jira", "url"),
    FieldSpec("jira_email", "jira", "email"),
    FieldSpec("jira_api_token", "jira", "secret"),
    FieldSpec("jira_max_concurrency", "jira", "int", 1, 32),
    FieldSpec("jira_max_retries", "jira", "int", 0, 20),
    FieldSpec("jira_timeout_seconds", "jira", "float", 1, 300),
    FieldSpec("timezone", "calendar", "timezone"),
    FieldSpec("checkpoint_weekday", "calendar", "weekday", 0, 6),
    FieldSpec("checkpoint_hour", "calendar", "hour", 0, 23),
    FieldSpec("default_sprint_weeks", "calendar", "int", 1, 8),
    FieldSpec("history_sprints", "collection", "int", 1, 52),
    FieldSpec("history_days", "collection", "int", 7, 1095),
    FieldSpec("collect_interval_minutes", "collection", "int", 5, 1440),
    FieldSpec("incremental_overlap_minutes", "collection", "int", 0, 240),
    FieldSpec("public_url", "notifications", "url"),
    FieldSpec("smtp_host", "notifications", "string"),
    FieldSpec("smtp_port", "notifications", "int", 1, 65535),
    FieldSpec("smtp_user", "notifications", "string"),
    FieldSpec("smtp_password", "notifications", "secret"),
    FieldSpec("smtp_from", "notifications", "email"),
    FieldSpec("smtp_starttls", "notifications", "bool"),
    FieldSpec("ai_enabled", "ai", "bool"),
    FieldSpec("anthropic_api_key", "ai", "secret"),
    FieldSpec("ai_model", "ai", "string"),
    FieldSpec("ai_timeout_seconds", "ai", "float", 5, 600),
    FieldSpec("locale", "general", "locale"),
    FieldSpec("template_max_mb", "general", "int", 1, 500),
)
REGISTRY: dict[str, FieldSpec] = {spec.key: spec for spec in FIELDS}

BOOTSTRAP: tuple[str, ...] = (
    "database_url",
    "data_dir",
    "api_token",
    "cors_origins",
    "log_level",
    "log_json",
    "secret_key",
)

_lock = threading.Lock()
_fernets: dict[tuple[str, str], Fernet] = {}
_warned: set[str] = set()
#: The last overlay: (base, the stored row as JSON, effective). One row read per request, and a
#: Settings validation only when the row or the base changed.
_cache: tuple[Settings, str, Settings] | None = None


# ---------------------------------------------------------------- key


def secret_key_source(base: Settings) -> Literal["environment", "file"]:
    """Where the key comes from (or will, once generated)."""
    return "environment" if base.secret_key.get_secret_value() else "file"


def _key_file(base: Settings) -> Path:
    return base.data_dir / SECRET_FILE


def _file_key(path: Path) -> bytes:
    """The generated key, created on first use with mode 0600. ``O_EXCL`` settles the race between
    the API and the scheduler starting together on the same data dir: the loser reads the winner's."""
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "wb") as out:
                out.write(Fernet.generate_key())
            os.chmod(path, 0o600)
            log_event(log, "secret key generated", path=str(path))
    return path.read_bytes().strip()


def fernet(base: Settings) -> Fernet:
    env_key = base.secret_key.get_secret_value()
    ident = ("env", env_key) if env_key else ("file", str(_key_file(base).resolve()))
    found = _fernets.get(ident)
    if found is None:
        with _lock:
            found = _fernets.get(ident)
            if found is None:
                key = env_key.encode() if env_key else _file_key(_key_file(base))
                found = _fernets[ident] = Fernet(key)
    return found


def _encrypt(base: Settings, plain: str) -> dict[str, str]:
    return {_ENC: fernet(base).encrypt(plain.encode()).decode()}


def _decrypt(base: Settings, key: str, stored: Any) -> str | None:
    """The plaintext, or None when it cannot be read back (key lost or changed): not set, logged
    once per stored value, never an error."""
    token = stored.get(_ENC) if isinstance(stored, dict) else None
    if isinstance(token, str):
        try:
            plain = fernet(base).decrypt(token.encode()).decode()
        except (InvalidToken, ValueError):
            plain = None
        else:
            register_secret(plain)
            return plain
    marker = f"{key}:{token}"
    if marker not in _warned:
        _warned.add(marker)
        log_event(
            log, "stored secret cannot be decrypted; treated as not set", level=logging.WARNING, field=key
        )
    return None


# ---------------------------------------------------------------- validation


def _bad(spec: FieldSpec, kind: str, **params: Any) -> Invalid:
    return Invalid(Msg(f"config.error.{kind}", key=spec.key, **params), field=spec.key)


def _number(spec: FieldSpec, value: Any, cast: type[int] | type[float]) -> int | float:
    number: int | float | None = None
    if isinstance(value, str):
        try:
            number = cast(value.strip())
        except ValueError:
            number = None
    elif (
        isinstance(value, int | float)
        and not isinstance(value, bool)
        # 2.5 is not a whole number, and nan/inf are not numbers anybody meant
        and math.isfinite(value)
        and (cast is float or float(value).is_integer())
    ):
        number = cast(value)
    if (
        number is None
        or not math.isfinite(number)
        or (spec.min is not None and number < spec.min)
        or (spec.max is not None and number > spec.max)
    ):
        raise _bad(spec, spec.kind, min=_plain(spec.min), max=_plain(spec.max))
    return number


def _plain(bound: float | None) -> int | float | None:
    return int(bound) if bound is not None and float(bound).is_integer() else bound


_TRUE = {"true", "1", "yes", "on"}
_FALSE = {"false", "0", "no", "off"}


def coerce(spec: FieldSpec, value: Any) -> Any:
    """The value to store for ``spec``, or ``Invalid`` naming the field. Strings are accepted for
    every kind, which is what the CLI sends."""
    kind = spec.kind
    if kind in {"int", "weekday", "hour"}:
        return _number(spec, value, int)
    if kind == "float":
        return _number(spec, value, float)
    if kind == "bool":
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.strip().lower() in _TRUE | _FALSE:
            return value.strip().lower() in _TRUE
        raise _bad(spec, "bool")
    if not isinstance(value, str):
        raise _bad(spec, "string")
    text = value.strip()
    if kind == "url" and text:
        parts = urlsplit(text)
        if parts.scheme not in {"http", "https"} or not parts.netloc or any(c.isspace() for c in text):
            raise _bad(spec, "url")
    elif kind == "email" and text:
        name, at, domain = text.partition("@")
        if not (name and at and "." in domain.strip(".") and not any(c.isspace() for c in text)):
            raise _bad(spec, "email")
    elif kind == "timezone":
        try:
            ZoneInfo(text)
        except (ZoneInfoNotFoundError, ValueError):
            raise _bad(spec, "timezone", value=text) from None
    elif kind == "locale":
        try:
            text = canonical(text)
        except ValueError:
            raise _bad(spec, "locale", value=text, supported=", ".join(SUPPORTED)) from None
    elif kind == "secret":
        return value  # a secret is taken exactly as typed
    return text


def _known(key: str) -> FieldSpec:
    spec = REGISTRY.get(key)
    if spec is None:
        if key in BOOTSTRAP:
            raise Invalid(Msg("config.error.bootstrap", key=key), field=key)
        raise Invalid(Msg("config.error.unknown", key=key), field=key)
    return spec


# ---------------------------------------------------------------- overlay


def load_stored(session: Session) -> dict[str, Any]:
    stored = repo.get_setting(session, CONFIG_KEY, {})
    return dict(stored) if isinstance(stored, dict) else {}


def _decoded(base: Settings, stored: Mapping[str, Any]) -> dict[str, Any]:
    """Stored values ready for ``Settings``: secrets decrypted, unknown keys (a field dropped from
    the registry) and unreadable secrets left out."""
    out: dict[str, Any] = {}
    for key, value in stored.items():
        spec = REGISTRY.get(key)
        if spec is None:
            continue
        if spec.secret:
            plain = _decrypt(base, key, value)
            if plain is not None:
                out[key] = plain
        else:
            out[key] = value
    return out


def overlay(base: Settings, values: Mapping[str, Any], *, strict: bool = False) -> Settings:
    """``base`` with ``values`` laid over it, through ``Settings``' validators.

    Every field is passed explicitly, so the environment and ``.env`` cannot reclaim one. Not
    strict (reading), a stored value the validators now refuse — a time zone tzdata dropped — is
    left out and logged rather than taking the whole configuration down; strict (writing), the
    ``ValidationError`` is raised as ``Invalid`` naming the field.
    """
    values = dict(values)
    while True:
        data = {**{name: getattr(base, name) for name in Settings.model_fields}, **values}
        try:
            return Settings(_env_file=None, _secrets_dir=None, **data)
        except ValidationError as exc:
            refused = {str(err["loc"][0]) for err in exc.errors() if err.get("loc")} & set(values)
            if strict or not refused:
                key = next(iter(sorted(refused)), None)
                if strict and key is not None:
                    raise Invalid(Msg("config.error.refused", key=key), field=key) from None
                raise
            for key in refused:
                values.pop(key)
                log_event(
                    log, "stored setting refused; using the environment's", level=logging.WARNING, field=key
                )


def effective_settings(base: Settings, session: Session) -> Settings:
    """The settings every consumer should read: ``base`` (the environment) with the values saved
    in the app laid over it."""
    global _cache
    stored = load_stored(session)
    if not stored:
        return base
    raw = json.dumps(stored, sort_keys=True, default=str)
    cached = _cache
    if cached is not None and cached[0] is base and cached[1] == raw:
        return cached[2]
    effective = overlay(base, _decoded(base, stored))
    _cache = (base, raw, effective)
    return effective


def effective_from(base: Settings, sessions: sessionmaker[Session]) -> Settings:
    """:func:`effective_settings` for code that holds a session factory (scheduler, CLI)."""
    with session_scope(sessions) as session:
        return effective_settings(base, session)


# ---------------------------------------------------------------- writes


def _save(session: Session, stored: Mapping[str, Any]) -> None:
    repo.set_setting(session, CONFIG_KEY, dict(stored))
    session.flush()


def update(base: Settings, session: Session, values: Mapping[str, Any]) -> None:
    """Apply a partial update. Everything is validated before anything is stored: one refused
    value refuses the whole update. For a secret, ``None`` or ``""`` forgets the stored value; for
    anything else ``None`` means ``""``, which only the text kinds accept."""
    stored = load_stored(session)
    secrets: dict[str, str] = {}  # encrypted only once the whole update is known to be valid
    for key, value in values.items():
        spec = _known(key)
        stored.pop(key, None)
        secrets.pop(key, None)
        if spec.secret and value in (None, ""):
            continue
        if value is None:
            value = ""  # a null is an empty value: kept for text, refused by every other kind
        if spec.secret:
            secrets[key] = coerce(spec, value)
        else:
            stored[key] = coerce(spec, value)
    overlay(base, {**_decoded(base, stored), **secrets}, strict=True)
    for key, plain in secrets.items():
        register_secret(plain)
        stored[key] = _encrypt(base, plain)
    _save(session, stored)


def forget(session: Session, key: str) -> None:
    _known(key)
    stored = load_stored(session)
    if stored.pop(key, None) is not None:
        _save(session, stored)


def sources(base: Settings, stored: Mapping[str, Any]) -> dict[str, Source]:
    readable = _decoded(base, stored)
    return {
        spec.key: "database"
        if spec.key in readable
        else "environment"
        if spec.key in base.model_fields_set
        else "default"
        for spec in FIELDS
    }


def importable(base: Settings, stored: Mapping[str, Any]) -> list[str]:
    return [key for key, source in sources(base, stored).items() if source == "environment"]


def import_env(base: Settings, session: Session) -> list[str]:
    """Copy every field the environment sets (and the app does not) into the database. A value
    the app's own rules refuse, or an empty secret, stays in the environment and is not listed."""
    stored = load_stored(session)
    imported: list[str] = []
    for key in importable(base, stored):
        spec = REGISTRY[key]
        value = getattr(base, key)
        if spec.secret:
            plain = value.get_secret_value()
            if not plain:
                continue
            stored[key] = _encrypt(base, plain)
        else:
            try:
                stored[key] = coerce(spec, value)
            except Invalid:
                continue
        imported.append(key)
    if imported:
        _save(session, stored)
    return imported


# ---------------------------------------------------------------- reading


def _jsonable(value: Any) -> Any:
    if isinstance(value, SecretStr):
        return None
    if isinstance(value, Path):
        return str(value)
    return value


def _default(key: str) -> Any:
    return _jsonable(Settings.model_fields[key].default)


def _masked_url(url: str) -> str:
    try:
        return make_url(url).render_as_string(hide_password=True)
    except Exception:  # an unparseable URL is shown without anything that looks like a password
        return url.split("@")[-1]


def _bootstrap(base: Settings) -> list[dict[str, Any]]:
    """Env-only fields, read-only. The two secrets say only whether they are set; the key's
    source is ``environment``, ``file`` (the generated one) or ``default`` (none generated yet)."""

    def source(key: str) -> Source:
        return "environment" if key in base.model_fields_set else "default"

    key_source: str = secret_key_source(base)
    if key_source == "file" and not _key_file(base).exists():
        key_source = "default"
    return [
        {"key": "database_url", "value": _masked_url(base.database_url), "source": source("database_url")},
        {"key": "data_dir", "value": str(base.data_dir), "source": source("data_dir")},
        {"key": "api_token", "value": bool(base.api_token.get_secret_value()), "source": source("api_token")},
        {"key": "cors_origins", "value": list(base.cors_origins), "source": source("cors_origins")},
        {"key": "log_level", "value": base.log_level, "source": source("log_level")},
        {"key": "log_json", "value": base.log_json, "source": source("log_json")},
        {"key": "secret_key", "value": key_source != "default", "source": key_source},
    ]


def view(base: Settings, session: Session) -> dict[str, Any]:
    """The ``GET /config`` answer. A secret's value is never in it, only whether one exists."""
    stored = load_stored(session)
    effective = effective_settings(base, session)
    readable = _decoded(base, stored)
    where = sources(base, stored)
    groups: dict[str, list[dict[str, Any]]] = {group: [] for group in GROUPS}
    for spec in FIELDS:
        value = getattr(effective, spec.key)
        env_value = getattr(base, spec.key)
        if spec.secret:
            is_set = bool(value.get_secret_value())
            shown = None
            env_plain = env_value.get_secret_value()
        else:
            shown = _jsonable(value)
            is_set = shown not in ("", None)
            env_plain = env_value
        differs = (
            where[spec.key] == "database"
            and spec.key in base.model_fields_set
            and readable.get(spec.key) != env_plain
        )
        groups[spec.group].append(
            {
                "key": spec.key,
                "kind": spec.kind,
                "value": shown,
                "is_set": is_set,
                "source": where[spec.key],
                "default": None if spec.secret else _default(spec.key),
                "min": _plain(spec.min),
                "max": _plain(spec.max),
                "env_value_differs": differs,
            }
        )
    return {
        "groups": [{"id": group, "fields": fields} for group, fields in groups.items()],
        "bootstrap": _bootstrap(base),
        "jira_configured": effective.jira_configured(),
        "importable": importable(base, stored),
    }


def draft(effective: Settings, values: Mapping[str, Any]) -> Settings:
    """``effective`` with unsaved values laid over it (the wizard's connection test)."""
    return overlay(effective, values, strict=True)
