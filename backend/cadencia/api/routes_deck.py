"""Apresentação workflow around a generated deck: PDF, previews, partial runs, comparison,
review and read-only share links (#8–#14), plus the public routes a share link opens."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from cadencia.api.deps import (
    JSONDict,
    Now,
    SessionDep,
    SettingsDep,
    author_of,
    not_found,
    parse_instant,
    stored_file,
)
from cadencia.errors import NotFound
from cadencia.i18n import tr
from cadencia.report.core.fonts import face_file, font_plan
from cadencia.report.core.scene import picture_blob
from cadencia.report.library import (
    asset_dict,
    beat,
    block_dict,
    create_block,
    delete_block,
    leave,
    list_blocks,
    record_presentation,
    restore_slide,
    slide_history,
    template_diagnostics,
    template_usage,
    update_asset,
    use_block,
)
from cadencia.report.narrative import NarrativeUnavailable, draft_narrative, narrative_facts
from cadencia.report.qanda import ask_question, delete_question, list_questions, question_dict, set_answered
from cadencia.report.service import (
    compare_runs,
    create_share,
    deck_source,
    default_reference,
    download_blocker,
    generate_report,
    review_run,
    run_accessibility,
    run_dict,
    run_pdf,
    run_scene,
    share_dict,
    shared_run,
    template_accessibility,
    variable_registry,
)
from cadencia.store import schema as s

router = APIRouter(prefix="/reports", tags=["apresentação"])
public_router = APIRouter(prefix="/public", tags=["público"])

PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def _run(session: SessionDep, run_id: str) -> s.ReportRunRow:
    row = session.get(s.ReportRunRow, run_id)
    if row is None:
        raise not_found(tr("deck_api.run_not_found.cause"), run_id)
    return row


# ------------------------------------------------------------ download as PPTX or PDF (#8)


@router.get("/runs/{run_id}/file")
def download_file(
    run_id: str,
    session: SessionDep,
    settings: SettingsDep,
    format: Literal["pptx", "pdf"] = "pptx",
    force: bool = False,
) -> FileResponse:
    """The deck as .pptx or .pdf. Refused (409) while validation or a required approval says no,
    unless ``force`` — the deck somebody needs to see what is wrong must stay reachable (RF-70)."""
    row = _run(session, run_id)
    blocker = download_blocker(session, row)
    if blocker and not force:
        raise HTTPException(409, detail=blocker)
    stem = f"cadencia-{row.reference_at:%Y-%m-%d}-{row.id}"
    if format == "pdf":
        try:
            path = run_pdf(settings, row)
        except NotFound:
            raise not_found(tr("deck_api.deck_not_found.cause"), run_id) from None
        return FileResponse(path, media_type="application/pdf", filename=f"{stem}.pdf")
    if not row.path:
        raise not_found(tr("deck_api.deck_not_found.cause"), run_id)
    try:
        return FileResponse(row.path, media_type=PPTX, filename=f"{stem}.pptx")
    except RuntimeError:  # pragma: no cover - file vanished between the check and the send
        raise not_found(tr("deck_api.deck_not_found.cause"), run_id) from None


# ------------------------------------------------------------ preview one board (#9), partial run (#10)


class PreviewBody(BaseModel):
    board_id: int | None = None
    audience: str = ""
    reference: str | None = None


@router.post("/templates/{template_id}/preview-run", status_code=201)
def preview_run(
    template_id: int, body: PreviewBody, session: SessionDep, settings: SettingsDep, now: Now
) -> JSONDict:
    """The whole deck for one board, as it would come out now — never listed among the deliveries."""
    run = generate_report(
        session,
        settings,
        template_id,
        reference=parse_instant(body.reference, now) if body.reference else None,
        board_ids=[body.board_id] if body.board_id is not None else None,
        render=True,  # the canvas crops charts from the rendered slides
        now=now,
        kind="previa",
        audience=body.audience,
    )
    return run_dict(run)


class PartialBody(BaseModel):
    slide_ids: list[int] | None = None
    board_ids: list[int] | None = None
    #: #27: the whole deck again with today's numbers ("Atualizar números" while presenting).
    agora: bool = False


@router.post("/runs/{run_id}/partial", status_code=201)
def partial_run(
    run_id: str, body: PartialBody, session: SessionDep, settings: SettingsDep, now: Now
) -> JSONDict:
    """Regenerate some template slides and/or boards of an existing deck, at the same reference —
    a quick check of one fix without redoing thirty slides. It is a deck of its own, linked back."""
    parent = _run(session, run_id)
    if not body.slide_ids and not body.board_ids and not body.agora:
        raise HTTPException(
            400,
            detail={
                "cause": tr("deck_api.nothing_to_regenerate.cause"),
                "message": tr("deck_api.nothing_to_regenerate.message"),
            },
        )
    board_ids = body.board_ids or parent.board_ids
    reference = now if body.agora else parent.reference_at
    run = generate_report(
        session,
        settings,
        parent.template_id,
        reference=reference,
        board_ids=board_ids,
        now=now,
        kind="parcial",
        audience=parent.audience,
        only_slides=body.slide_ids,
        parent_run_id=parent.id,
    )
    return run_dict(run)


# ------------------------------------------------------------ compare two runs (#11)


@router.get("/runs/{before_id}/compare/{after_id}")
def compare(before_id: str, after_id: str, session: SessionDep) -> JSONDict:
    before, after = _run(session, before_id), _run(session, after_id)
    names = {b.id: b.name for b in session.scalars(select(s.BoardRow))}
    try:
        return compare_runs(before, after, names)
    except NotFound as exc:
        raise not_found(tr("deck_api.run_file_not_found.cause"), str(exc)) from None


# ------------------------------------------------------------ accessibility (#15)


@router.get("/runs/{run_id}/accessibility")
def run_a11y(run_id: str, session: SessionDep) -> JSONDict:
    try:
        return run_accessibility(session, _run(session, run_id))
    except NotFound:
        raise not_found(tr("deck_api.run_file_not_found.cause"), run_id) from None


@router.get("/templates/{template_id}/accessibility")
def template_a11y(template_id: int, session: SessionDep) -> JSONDict:
    template = session.get(s.TemplateRow, template_id)
    if template is None:
        raise not_found(tr("deck_api.template_not_found.cause"), str(template_id))
    return template_accessibility(session, template)


# ------------------------------------------------------------ review (#12)


class ReviewBody(BaseModel):
    acao: Literal["enviar", "aprovar", "reprovar", "reabrir"]
    nota: str = ""
    autor: str | None = None


@router.post("/runs/{run_id}/review")
def review(run_id: str, body: ReviewBody, request: Request, session: SessionDep) -> JSONDict:
    row = _run(session, run_id)
    review_run(session, row, body.acao, author_of(request, body.autor), body.nota)
    return run_dict(row)


# ------------------------------------------------------------ share links (#14)


class ShareBody(BaseModel):
    dias: int = Field(14, ge=1, le=90)
    autor: str | None = None


@router.get("/runs/{run_id}/shares")
def list_shares(run_id: str, session: SessionDep, settings: SettingsDep) -> JSONDict:
    _run(session, run_id)
    rows = session.scalars(
        select(s.DeckShareRow)
        .where(s.DeckShareRow.run_id == run_id)
        .order_by(s.DeckShareRow.created_at.desc())
    )
    return {"items": [share_dict(r, settings) for r in rows]}


@router.post("/runs/{run_id}/shares", status_code=201)
def add_share(
    run_id: str, body: ShareBody, request: Request, session: SessionDep, settings: SettingsDep
) -> JSONDict:
    row = create_share(session, _run(session, run_id), author_of(request, body.autor), body.dias)
    return share_dict(row, settings)


@router.delete("/shares/{token}", status_code=204)
def revoke_share(token: str, session: SessionDep) -> None:
    row = session.get(s.DeckShareRow, token)
    if row is None:
        raise not_found(tr("deck_api.share_not_found.cause"), "link")
    row.revoked_at = row.revoked_at or datetime.now(UTC)


# ------------------------------------------------------------ library: blocks (#16), images (#17)


class BlockBody(BaseModel):
    nome: str
    descricao: str = ""
    formas: dict[str, dict] = Field(default_factory=dict)
    autor: str | None = None


@router.get("/blocks")
def blocks(session: SessionDep) -> JSONDict:
    return {"items": [block_dict(b) for b in list_blocks(session)]}


@router.post("/blocks", status_code=201)
def add_block(body: BlockBody, request: Request, session: SessionDep) -> JSONDict:
    row = create_block(
        session,
        name=body.nome,
        description=body.descricao,
        author=author_of(request, body.autor),
        shapes=body.formas,
    )
    return block_dict(row)


@router.delete("/blocks/{block_id}", status_code=204)
def remove_block(block_id: int, session: SessionDep) -> None:
    delete_block(session, block_id)


@router.post("/blocks/{block_id}/use")
def use_block_route(block_id: int, session: SessionDep) -> JSONDict:
    return block_dict(use_block(session, block_id))


class AssetBody(BaseModel):
    rotulo: str | None = None
    etiquetas: list[str] | None = None


@router.patch("/assets/{asset_id}")
def patch_asset(asset_id: str, body: AssetBody, session: SessionDep) -> JSONDict:
    return asset_dict(update_asset(session, asset_id, label=body.rotulo, tags=body.etiquetas))


# ------------------------------------------------------------ presence (#19), slide history (#20)


class PresenceBody(BaseModel):
    slide: str = ""
    autor: str | None = None


def _presence_author(request: Request, fallback: str | None) -> str:
    return author_of(request, fallback) or tr("deck_api.anonymous")


@router.post("/templates/{template_id}/presence")
def presence(template_id: int, body: PresenceBody, request: Request, session: SessionDep) -> JSONDict:
    """Heartbeat from an open editor; the answer is who else has this template open, and where."""
    now = datetime.now(UTC)
    return {"others": beat(session, template_id, _presence_author(request, body.autor), body.slide, now)}


@router.delete("/templates/{template_id}/presence", status_code=204)
def presence_leave(template_id: int, request: Request, session: SessionDep, autor: str | None = None) -> None:
    leave(session, template_id, _presence_author(request, autor))


@router.get("/templates/{template_id}/slides/{slide_key}/history")
def history_of_slide(template_id: int, slide_key: str, session: SessionDep) -> JSONDict:
    return {"items": slide_history(session, template_id, slide_key)}


class RestoreSlideBody(BaseModel):
    version_id: int
    autor: str | None = None


@router.post("/templates/{template_id}/slides/{slide_key}/restore")
def restore_one_slide(
    template_id: int, slide_key: str, body: RestoreSlideBody, request: Request, session: SessionDep
) -> JSONDict:
    now = datetime.now(UTC)
    edits = restore_slide(
        session, template_id, body.version_id, slide_key, now, author_of(request, body.autor)
    )
    row = session.get(s.DeckEditRow, template_id)
    return {"edits": edits.model_dump(), "revision": row.revision if row else 0}


# ------------------------------------------------------------ diagnostics (#24), usage (#30)


@router.get("/templates/{template_id}/diagnostics")
def diagnostics(template_id: int, session: SessionDep) -> JSONDict:
    template = session.get(s.TemplateRow, template_id)
    if template is None:
        raise not_found(tr("deck_api.template_not_found.cause"), str(template_id))
    return template_diagnostics(session, template)


@router.get("/templates/{template_id}/usage")
def usage(template_id: int, session: SessionDep) -> JSONDict:
    return template_usage(session, template_id)


class PresentedBody(BaseModel):
    segundos: dict[str, float]


@router.post("/runs/{run_id}/presented", status_code=204)
def presented(run_id: str, body: PresentedBody, session: SessionDep) -> None:
    """How long each slide stayed on screen in one presentation (#30)."""
    record_presentation(session, _run(session, run_id), body.segundos)


# ------------------------------------------------------------ audience Q&A, Slides parity


class QuestionBody(BaseModel):
    texto: str
    autor: str | None = None


@router.get("/runs/{run_id}/questions")
def get_questions(run_id: str, session: SessionDep) -> JSONDict:
    _run(session, run_id)
    return {"items": [question_dict(q) for q in list_questions(session, run_id)]}


@router.post("/runs/{run_id}/questions", status_code=201)
def post_question(run_id: str, body: QuestionBody, request: Request, session: SessionDep) -> JSONDict:
    _run(session, run_id)
    row = ask_question(session, run_id, body.texto, author_of(request, body.autor))
    return question_dict(row)


class AnsweredBody(BaseModel):
    respondida: bool = True


@router.patch("/questions/{question_id}")
def patch_question(question_id: int, body: AnsweredBody, session: SessionDep) -> JSONDict:
    return question_dict(set_answered(session, question_id, body.respondida))


@router.delete("/questions/{question_id}", status_code=204)
def remove_question(question_id: int, session: SessionDep) -> None:
    delete_question(session, question_id)


# ------------------------------------------------------------ narrative suggested by AI (#7)


@router.get("/ai")
def ai_status(settings: SettingsDep) -> JSONDict:
    return {"enabled": settings.ai_enabled, "model": settings.ai_model if settings.ai_enabled else None}


class NarrativeBody(BaseModel):
    board_id: int


@router.post("/templates/{template_id}/narrative")
def narrative(
    template_id: int, body: NarrativeBody, session: SessionDep, settings: SettingsDep, now: Now
) -> JSONDict:
    """A draft paragraph for one board, from the numbers this template's deck would show. Nothing is
    saved: the person reviews it and stores it as a variable value if they want it in the deck."""
    if session.get(s.TemplateRow, template_id) is None:
        raise not_found(tr("deck_api.template_not_found.cause"), str(template_id))
    reference = default_reference(session, settings, [body.board_id], now)
    deck = deck_source(session, settings).deck_data(
        [body.board_id], reference=reference, now=now, registry=variable_registry(session, template_id)
    )
    board = deck.board_by_id(body.board_id)
    if board is None:
        raise not_found(tr("deck_api.board_without_data.cause"), str(body.board_id))
    facts = narrative_facts(board)
    try:
        text = draft_narrative(settings, facts)
    except NarrativeUnavailable as exc:
        raise HTTPException(
            503,
            detail={
                "cause": tr("deck_api.ai_unavailable.cause"),
                "message": str(exc),
                "action": tr("deck_api.ai_unavailable.action"),
            },
        ) from exc
    return {"texto": text, "fatos": facts, "modelo": settings.ai_model}


# ------------------------------------------------------------ public: what a share link opens


@public_router.get("/decks/{token}")
def public_deck(token: str, session: SessionDep) -> JSONDict:
    """The shared deck as a read-only scene. The token is the whole credential."""
    try:
        run = shared_run(session, token)
        scene = run_scene(session, run)
    except NotFound:
        raise not_found(tr("deck_api.share_unavailable.cause"), "link") from None
    share = session.get(s.DeckShareRow, token)
    if share is not None:
        share.views += 1
    template = session.get(s.TemplateRow, run.template_id)
    families: list[str] = []
    if template is not None:
        theme_fonts = (template.manifest.get("theme") or {}).get("fonts") or {}
        families = [str(v) for v in theme_fonts.values() if v]
    return {
        # Only what the page draws: no template id to wander from, no validation internals.
        "scene": {
            **scene,
            "run_id": None,
            "template_id": None,
            "image_base": f"/api/public/decks/{token}/images",
        },
        "reference_at": run.reference_at.isoformat(),
        "template": template.name if template else "",
        "boards": [
            b.name
            for b in session.scalars(select(s.BoardRow).where(s.BoardRow.id.in_(run.board_ids or [-1])))
        ],
        "fonts": font_plan(families),
        # Rendered slides, in order: the canvas crops what it cannot draw (charts) from these.
        "images": [
            path.rsplit("/", 1)[-1] for path in (run.validation.get("preview") or {}).get("images") or []
        ],
    }


@public_router.get("/decks/{token}/images/{shape_key}")
def public_image(token: str, shape_key: str, session: SessionDep) -> Response:
    try:
        run = shared_run(session, token)
    except NotFound:
        raise not_found(tr("deck_api.share_unavailable.cause"), "link") from None
    blob = picture_blob(run.path or "", shape_key) if run.path else None
    if blob is None:
        raise not_found(tr("deck_api.image_not_found.cause"), shape_key)
    content, content_type = blob
    return Response(
        content=content, media_type=content_type, headers={"Cache-Control": "private, max-age=3600"}
    )


@public_router.get("/decks/{token}/files/{name}")
def public_file(token: str, name: str, session: SessionDep, settings: SettingsDep) -> FileResponse:
    """The rendered slide images (and PDF) of the shared run — the canvas crops charts from them."""
    try:
        run = shared_run(session, token)
    except NotFound:
        raise not_found(tr("deck_api.share_unavailable.cause"), "link") from None
    return FileResponse(
        stored_file(settings.decks_dir, run.id, name), headers={"Cache-Control": "private, max-age=3600"}
    )


@public_router.get("/fonts/{face}/{variant}")
def public_font(face: str, variant: str) -> FileResponse:
    """The metric-compatible faces — font files, no data — so a shared deck wraps like the editor."""
    path = face_file(face, variant)
    if path is None:
        raise not_found(tr("deck_api.font_unavailable.cause"), f"{face} {variant}")
    media = "font/otf" if path.suffix.lower() == ".otf" else "font/ttf"
    return FileResponse(path, media_type=media, headers={"Cache-Control": "max-age=604800"})
