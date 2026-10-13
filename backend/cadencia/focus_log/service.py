"""The focus log's use cases: read the document, save it against the revision the editor started from."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from cadencia.focus_log import store
from cadencia.focus_log.model import Documento


class RevisionConflict(Exception):
    """The document changed since the editor loaded it. ``current`` is the revision now stored."""

    def __init__(self, current: int) -> None:
        super().__init__(current)
        self.current = current


def read(session: Session) -> dict:
    return store.read(session)


def save(session: Session, documento: Documento, base_revision: int | None, now: datetime) -> int:
    """Replace the document. ``base_revision`` is the revision the editor read; ``None`` overwrites."""
    current = store.revision(session)
    if base_revision is not None and base_revision != current:
        raise RevisionConflict(current)
    return store.replace(session, documento, now)
