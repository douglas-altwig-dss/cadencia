"""Structured logging with run/board context and secret redaction.

Every record carries the fields bound with :func:`log_context` (run id, board, step). Secrets
registered with :func:`register_secret` are masked in the final output, so a token can never
reach a log line even if it ends up inside an exception message.
"""

from __future__ import annotations

import json
import logging
import re
import sys
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

_context: ContextVar[dict[str, Any] | None] = ContextVar("cadencia_log_context", default=None)
_secrets: set[str] = set()
_BASIC_AUTH = re.compile(r"(Basic\s+)[A-Za-z0-9+/=]{8,}")


def register_secret(value: str | None) -> None:
    if value and len(value) >= 4:
        _secrets.add(value)


def redact(text: str) -> str:
    for secret in _secrets:
        text = text.replace(secret, "***")
    return _BASIC_AUTH.sub(r"\1***", text)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            **(_context.get() or {}),
            **getattr(record, "fields", {}),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return redact(json.dumps(payload, default=str, ensure_ascii=False))


class _TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        fields = {**(_context.get() or {}), **getattr(record, "fields", {})}
        suffix = " ".join(f"{k}={v}" for k, v in fields.items())
        line = f"{record.levelname:<7} {record.name}: {record.getMessage()}"
        if suffix:
            line = f"{line} [{suffix}]"
        if record.exc_info:
            line = f"{line}\n{self.formatException(record.exc_info)}"
        return redact(line)


def configure_logging(level: str = "INFO", json_output: bool = True) -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(_JsonFormatter() if json_output else _TextFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # httpx logs every request URL at INFO and Alembic lists its plugins at startup; our own
    # events carry what matters.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("alembic").setLevel(logging.WARNING)


def new_run_id() -> str:
    return uuid.uuid4().hex[:12]


@contextmanager
def log_context(**fields: Any) -> Iterator[None]:
    token = _context.set({**(_context.get() or {}), **fields})
    try:
        yield
    finally:
        _context.reset(token)


def log_event(logger: logging.Logger, msg: str, *, level: int = logging.INFO, **fields: Any) -> None:
    logger.log(level, msg, extra={"fields": fields})


@contextmanager
def timed(logger: logging.Logger, step: str, **fields: Any) -> Iterator[None]:
    start = time.perf_counter()
    try:
        yield
    finally:
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        log_event(logger, f"etapa {step} concluída", step=step, duration_ms=duration_ms, **fields)
