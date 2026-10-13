"""``Msg``: a message key and its parameters, not yet text.

Pure code (``domain/``, ``report/core/``) builds these and never renders them, because it does not
know who will read the result or in which language (docs/i18n-backend.md, R1). This module imports
nothing from ``cadencia`` at load time so that pure code may import it; ``__str__`` reaches for the
renderer lazily.

Deliberately not a dataclass: FastAPI's encoder would quietly serialise a forgotten ``Msg`` as
``{"key": …, "params": …}``. As a plain ``__slots__`` class, a ``Msg`` that reaches a response
unrendered is a 500 and a failing test, which is the point.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

#: What a parameter may hold: JSON-safe values, nested messages, and lists of either. Dates travel
#: as ISO strings (the renderer formats them per locale), so a stored message can be rebuilt.
type Param = str | int | float | bool | Msg | list[Param] | None

#: The marker of a message serialised as JSON (``{"$msg": key, "params": {...}}``).
JSON_KEY = "$msg"


def _check(name: str, value: Any) -> Any:
    """``value`` as a parameter, with tuples as lists; anything not JSON-safe is refused now,
    where the mistake is, rather than when the message is stored or rendered."""
    if value is None or isinstance(value, str | bool | int | float | Msg):
        return value
    if isinstance(value, list | tuple):
        return [_check(name, item) for item in value]
    raise TypeError(
        f"message parameter {name!r} must be str, int, float, bool, None, Msg or a list of them; "
        f"got {type(value).__name__} (pass dates as ISO strings)"
    )


def _param_json(value: Any) -> Any:
    if isinstance(value, Msg):
        return value.to_json()
    if isinstance(value, list):
        return [_param_json(item) for item in value]
    return value


def _param_from_json(value: Any) -> Any:
    if Msg.is_json(value):
        return Msg.from_json(value)
    if isinstance(value, list):
        return [_param_from_json(item) for item in value]
    return value


def _copy(value: Any) -> Any:
    return [_copy(item) for item in value] if isinstance(value, list) else value


class Msg:
    """A catalogue key plus named parameters. Immutable, hashable, JSON round-trippable."""

    __slots__ = ("_params", "key")

    def __init__(self, key: str, /, **params: Param) -> None:
        if not isinstance(key, str) or not key:
            raise TypeError(f"message key must be a non-empty string, got {key!r}")
        object.__setattr__(self, "key", key)
        object.__setattr__(self, "_params", {name: _check(name, value) for name, value in params.items()})

    def __setattr__(self, name: str, value: object) -> None:
        raise AttributeError("Msg is immutable")

    @property
    def params(self) -> dict[str, Param]:
        """A copy of the parameters (lists copied too), so callers cannot change the message."""
        return {name: _copy(value) for name, value in self._params.items()}

    def to_json(self) -> dict[str, Any]:
        """``{"$msg": key, "params": {...}}``, nested messages included, ready to store."""
        return {JSON_KEY: self.key, "params": {name: _param_json(v) for name, v in self._params.items()}}

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> Msg:
        params = data.get("params") or {}
        return cls(data[JSON_KEY], **{str(name): _param_from_json(v) for name, v in params.items()})

    @staticmethod
    def is_json(value: object) -> bool:
        """True for a dict produced by :meth:`to_json` (or stored from one)."""
        return isinstance(value, dict) and JSON_KEY in value

    def _canonical(self) -> str:
        return json.dumps(self.to_json(), sort_keys=True, ensure_ascii=False)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Msg):
            return NotImplemented
        return self.key == other.key and self._canonical() == other._canonical()

    def __hash__(self) -> int:
        return hash(self._canonical())

    def __repr__(self) -> str:
        params = "".join(f", {name}={value!r}" for name, value in self._params.items())
        return f"Msg({self.key!r}{params})"

    def __str__(self) -> str:
        """The message in the ambient locale: the request's, else ``CADENCIA_LOCALE``. For logs,
        tests and the CLI; API responses render explicitly."""
        from cadencia.i18n.render import render  # lazy: keeps this module free of the catalogue

        return render(self)

    def __reduce__(self) -> tuple[Any, ...]:
        return (_restore, (self.key, self._params))


def _restore(key: str, params: dict[str, Any]) -> Msg:
    return Msg(key, **params)


def msg(key: str, /, **params: Param) -> Msg:
    """Alias of ``Msg(key, **params)``."""
    return Msg(key, **params)
