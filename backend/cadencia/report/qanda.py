"""Audience Q&A during a presentation — Slides' "Audience Tools", scoped to people who already
have access to Cadência (see :class:`cadencia.store.schema.ReportQuestionRow` for why there is no
separate public join link). A question is asked against a run; the presenter sees them live in
`PresentMode` and marks each answered."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from cadencia.errors import Invalid, NotFound
from cadencia.i18n import Msg
from cadencia.store import schema as s


def question_dict(row: s.ReportQuestionRow) -> dict[str, Any]:
    return {
        "id": row.id,
        "run_id": row.run_id,
        "text": row.text,
        "author": row.author,
        "asked_at": row.asked_at.isoformat(),
        "answered_at": row.answered_at.isoformat() if row.answered_at else None,
    }


def ask_question(session: Session, run_id: str, text: str, author: str | None) -> s.ReportQuestionRow:
    text = text.strip()
    if not text:
        raise Invalid(Msg("deck_api.question_empty"))
    row = s.ReportQuestionRow(run_id=run_id, text=text[:2000], author=author, asked_at=datetime.now(UTC))
    session.add(row)
    session.flush()
    return row


def list_questions(session: Session, run_id: str) -> list[s.ReportQuestionRow]:
    """Newest first — the presenter is watching this live, so the latest question is the one to see."""
    return list(
        session.scalars(
            select(s.ReportQuestionRow)
            .where(s.ReportQuestionRow.run_id == run_id)
            .order_by(s.ReportQuestionRow.asked_at.desc())
        )
    )


def set_answered(session: Session, question_id: int, answered: bool) -> s.ReportQuestionRow:
    row = session.get(s.ReportQuestionRow, question_id)
    if row is None:
        raise NotFound(question_id, Msg("deck_api.question_not_found"))
    row.answered_at = datetime.now(UTC) if answered else None
    session.flush()
    return row


def delete_question(session: Session, question_id: int) -> None:
    if session.get(s.ReportQuestionRow, question_id) is None:
        raise NotFound(question_id, Msg("deck_api.question_not_found"))
    session.execute(delete(s.ReportQuestionRow).where(s.ReportQuestionRow.id == question_id))
