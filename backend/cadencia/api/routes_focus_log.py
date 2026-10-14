"""The "Timeline de foco" log's HTTP surface. Isolated from Jira: see `cadencia.focus_log`."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from cadencia.api.deps import JSONDict, Now, SessionDep
from cadencia.focus_log import service
from cadencia.focus_log.model import Documento
from cadencia.focus_log.service import RevisionConflict
from cadencia.i18n import tr

router = APIRouter(prefix="/focus-log", tags=["timeline de foco"])


class SaveBody(Documento):
    #: The revision the editor read. A mismatch means the log changed in between (409).
    base_revision: int | None = None


@router.get("")
def read_log(session: SessionDep) -> JSONDict:
    return service.read(session)


@router.put("")
def save_log(body: SaveBody, session: SessionDep, now: Now) -> JSONDict:
    documento = Documento.model_validate(body.model_dump(exclude={"base_revision"}))
    try:
        revision = service.save(session, documento, body.base_revision, now)
    except RevisionConflict as conflict:
        raise HTTPException(
            409,
            detail={
                "cause": tr("focus_log.conflict.cause"),
                "action": tr("focus_log.conflict.action"),
                "revision": conflict.current,
            },
        ) from conflict
    return {"saved": True, "revision": revision, **service.read(session)}
