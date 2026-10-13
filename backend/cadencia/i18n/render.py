"""The catalogue and the functions that turn a ``Msg`` into text.

Catalogues live in ``cadencia/i18n/locales/<locale>/<namespace>.py``, each exporting
``MESSAGES: dict[str, Entry]`` with keys local to the namespace. The full key is
``"<namespace>.<local key>"``. Namespaces are discovered with ``pkgutil``, so adding one is adding
three files — no registry to edit. en-US is the source of truth for the key set; the tests in
``tests/test_i18n.py`` hold the other two to it.

An entry is a ``str`` (``str.format_map`` with named fields) or a callable taking the parameters as
keyword arguments (plurals, conditionals, locale formatting). Nested ``Msg`` parameters, and lists
of them, are rendered in the same locale before the entry sees them.
"""

from __future__ import annotations

import importlib
import pkgutil
import threading
from collections.abc import Callable, Mapping
from types import MappingProxyType
from typing import Any

from cadencia.i18n.message import Msg
from cadencia.i18n.runtime import DEFAULT_LOCALE, SUPPORTED, canonical, current_locale, negotiate

type Entry = str | Callable[..., str]

_LOCALES_PACKAGE = "cadencia.i18n.locales"
_lock = threading.Lock()
_namespaces: dict[str, Mapping[str, Mapping[str, Entry]]] = {}
_catalogs: dict[str, Mapping[str, Entry]] = {}


def _package(locale: str) -> str:
    return f"{_LOCALES_PACKAGE}.{locale.replace('-', '_')}"


def _load(locale: str) -> Mapping[str, Mapping[str, Entry]]:
    package = importlib.import_module(_package(locale))
    found: dict[str, Mapping[str, Entry]] = {}
    for info in sorted(pkgutil.iter_modules(package.__path__), key=lambda i: i.name):
        if info.name.startswith("_") or info.ispkg:
            continue
        module = importlib.import_module(f"{package.__name__}.{info.name}")
        messages = getattr(module, "MESSAGES", None)
        if not isinstance(messages, dict):
            raise TypeError(f"{module.__name__} must define MESSAGES: dict[str, Entry]")
        for key, entry in messages.items():
            if not isinstance(key, str) or not (isinstance(entry, str) or callable(entry)):
                raise TypeError(f"{module.__name__}: bad entry {key!r} -> {entry!r}")
        found[info.name] = MappingProxyType(dict(messages))
    return MappingProxyType(found)


def namespaces(locale: str) -> Mapping[str, Mapping[str, Entry]]:
    """``{namespace: {local key: entry}}`` for one locale, loaded once."""
    locale = canonical(locale)
    loaded = _namespaces.get(locale)
    if loaded is None:
        with _lock:
            loaded = _namespaces.get(locale)
            if loaded is None:
                loaded = _namespaces[locale] = _load(locale)
    return loaded


def catalog(locale: str) -> Mapping[str, Entry]:
    """Every entry of one locale under its full key (``"common.error.invalid"``)."""
    locale = canonical(locale)
    flat = _catalogs.get(locale)
    if flat is None:
        flat = MappingProxyType(
            {
                f"{namespace}.{key}": entry
                for namespace, messages in namespaces(locale).items()
                for key, entry in messages.items()
            }
        )
        _catalogs[locale] = flat
    return flat


def _resolve_locale(locale: str | None) -> str:
    if locale is None:
        return current_locale()
    return locale if locale in SUPPORTED else negotiate(locale)


def _entry(key: str, locale: str) -> Entry:
    entry = catalog(locale).get(key)
    if entry is None and locale != DEFAULT_LOCALE:
        entry = catalog(DEFAULT_LOCALE).get(key)
    if entry is None:
        raise KeyError(f"no catalogue entry for message key {key!r}")
    return entry


def _param(value: Any, locale: str) -> Any:
    if isinstance(value, Msg):
        return render(value, locale)
    if isinstance(value, list):
        return [_param(item, locale) for item in value]
    return value


def render(value: Msg | str | None, locale: str | None = None) -> str:
    """``value`` as text in ``locale`` (default: the ambient one).

    A ``str`` passes through untouched — it is legacy stored text or already rendered — and
    ``None`` is ``""``. A ``{"$msg": …}`` dict is accepted too. A key missing in ``locale`` falls
    back to en-US; missing there as well it raises ``KeyError`` (a bug the catalogue tests catch).
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if Msg.is_json(value):
        value = Msg.from_json(value)  # type: ignore[arg-type]
    if not isinstance(value, Msg):
        raise TypeError(f"cannot render {type(value).__name__}: expected Msg, str or None")
    resolved = _resolve_locale(locale)
    entry = _entry(value.key, resolved)
    params = {name: _param(param, resolved) for name, param in value.params.items()}
    text = entry.format_map(params) if isinstance(entry, str) else entry(**params)
    if not isinstance(text, str):
        raise TypeError(f"catalogue entry {value.key!r} ({resolved}) returned {type(text).__name__}")
    return text


def tr(key: str, /, **params: Any) -> str:
    """``render(Msg(key, **params))`` in the ambient locale: a boundary's own text."""
    return render(Msg(key, **params))


def localize(tree: Any, locale: str | None = None) -> Any:
    """A copy of ``tree`` (dicts, lists, tuples, nested) with every ``Msg`` and every
    ``{"$msg": …}`` dict replaced by its text. Other values are shared, not copied."""
    resolved = _resolve_locale(locale)

    def walk(node: Any) -> Any:
        if isinstance(node, Msg):
            return render(node, resolved)
        if isinstance(node, dict):
            if Msg.is_json(node):
                return render(Msg.from_json(node), resolved)
            return {key: walk(value) for key, value in node.items()}
        if isinstance(node, list):
            return [walk(item) for item in node]
        if isinstance(node, tuple):
            return tuple(walk(item) for item in node)
        return node

    return walk(tree)


def stored_text(
    record: Mapping[str, Any] | None, legacy: str | None, locale: str | None = None
) -> str | None:
    """Text for something persisted: the ``$msg`` record rendered in ``locale`` when there is one,
    else the ``legacy`` text stored beside it (rows written before the record existed).

    A record that no longer renders (a key removed since it was stored) falls back to the legacy
    text rather than failing a page over history; with no legacy text it raises.
    """
    if record is None or not Msg.is_json(record):
        return legacy
    try:
        return render(Msg.from_json(record), locale)
    except (KeyError, TypeError, ValueError, IndexError):
        if legacy is None:
            raise
        return legacy
