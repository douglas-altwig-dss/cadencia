"""The focus log's rows: read as a document, replaced as a whole. Persistence only, no rules."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from cadencia.focus_log.model import Documento
from cadencia.store import schema as s


def revision(session: Session) -> int:
    row = session.get(s.FocusLogStateRow, 1)
    return row.revision if row else 0


def read(session: Session) -> dict:
    """The stored document as JSON-ready data, lists in the order they were saved."""
    pessoas = session.scalars(select(s.FocusLogPersonRow).order_by(s.FocusLogPersonRow.position)).all()
    temas = session.scalars(select(s.FocusLogThemeRow).order_by(s.FocusLogThemeRow.position)).all()
    registros = session.scalars(select(s.FocusLogEntryRow).order_by(s.FocusLogEntryRow.position)).all()
    sinais = session.scalars(select(s.FocusLogSignalRow).order_by(s.FocusLogSignalRow.position)).all()
    return {
        "revision": revision(session),
        "pessoas": [{"id": p.id, "nome": p.nome, "cargo": p.cargo, "cor": p.cor} for p in pessoas],
        "temas": [{"nome": t.nome, "cor": t.cor, "palavras": t.palavras} for t in temas],
        "sinais": [
            {"nome": x.nome, "cor": x.cor, "palavras": x.palavras, "gatilho": x.gatilho} for x in sinais
        ],
        "registros": [
            {
                "uid": r.uid,
                "tipo": r.tipo,
                "nome": r.nome,
                "data": r.data.isoformat(),
                "registro": r.registro,
                "de_tema": r.de_tema,
                "para_tema": r.para_tema,
                "icone": r.icone,
                "cor_destaque": r.cor_destaque,
                "estilo_linha": r.estilo_linha,
            }
            for r in registros
        ],
    }


def replace(session: Session, documento: Documento, now: datetime) -> int:
    """Store the whole document and bump the revision. Returns the new revision."""
    session.execute(delete(s.FocusLogPersonRow))
    session.execute(delete(s.FocusLogThemeRow))
    session.execute(delete(s.FocusLogEntryRow))
    session.execute(delete(s.FocusLogSignalRow))
    session.add_all(
        s.FocusLogSignalRow(position=i, nome=x.nome, cor=x.cor, palavras=x.palavras, gatilho=x.gatilho)
        for i, x in enumerate(documento.sinais)
    )
    session.add_all(
        s.FocusLogPersonRow(id=p.id, position=i, nome=p.nome, cargo=p.cargo, cor=p.cor)
        for i, p in enumerate(documento.pessoas)
    )
    session.add_all(
        s.FocusLogThemeRow(position=i, nome=t.nome, cor=t.cor, palavras=t.palavras)
        for i, t in enumerate(documento.temas)
    )
    session.add_all(
        s.FocusLogEntryRow(
            uid=r.uid,
            position=i,
            tipo=r.tipo,
            nome=r.nome,
            data=r.data,
            registro=r.registro,
            de_tema=r.de_tema,
            para_tema=r.para_tema,
            icone=r.icone,
            cor_destaque=r.cor_destaque,
            estilo_linha=r.estilo_linha,
        )
        for i, r in enumerate(documento.registros)
    )
    state = session.get(s.FocusLogStateRow, 1)
    if state is None:
        state = s.FocusLogStateRow(id=1, revision=0, updated_at=now)
        session.add(state)
    state.revision += 1
    state.updated_at = now
    session.flush()
    return state.revision
