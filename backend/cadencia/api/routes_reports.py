"""Deck templates, mapping, generation and history (RF-37 … RF-44)."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select

from cadencia import notify
from cadencia.analytics.serialize import iso
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
from cadencia.errors import Invalid, NotFound
from cadencia.i18n import Msg, localize, tr
from cadencia.report.core.context import FIXED_PREFIX, catalog
from cadencia.report.core.edits import DeckEdits, merge_edits
from cadencia.report.core.fonts import face_file, font_plan
from cadencia.report.core.manifest import extract_manifest, target_ids
from cadencia.report.core.mapping import COLORBLIND_SAFE_PALETTE, DECK_STATUSES, DeckMapping
from cadencia.report.core.scene import picture_blob
from cadencia.report.core.suggest import apply_mapping_clone, suggest_mapping
from cadencia.report.service import (
    IMAGE_TYPES,
    catalog_extras,
    check_source_field,
    check_writable,
    current_document,
    download_blocker,
    field_catalog,
    generate_report,
    load_edits,
    localized_catalog,
    preview_fields,
    preview_slide,
    reassociate_run,
    remove_template,
    replace_in_variables,
    resolve_source_fields,
    restore_version,
    run_dict,
    run_scene,
    save_edits,
    source_kind,
    store_asset,
    store_template,
    template_picture,
    template_previews,
    template_readiness,
    template_scene,
    variable_conflicts,
    version_diff,
)
from cadencia.store import repo
from cadencia.store import schema as s

router = APIRouter(prefix="/reports", tags=["presentation"])
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
ASSET_MAX_BYTES = 20 * 1024 * 1024


async def _read_capped(file: UploadFile, limit: int, cause: str) -> bytes:
    """The upload's bytes, refused once they pass ``limit`` rather than after reading all of them."""
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(
            413,
            detail={"cause": cause, "message": tr("deck_api.too_large.message", mb=limit // (1024 * 1024))},
        )
    return content


def _template(session: SessionDep, template_id: int) -> s.TemplateRow:
    row = session.get(s.TemplateRow, template_id)
    if row is None:
        raise not_found(
            tr("deck_api.template_not_found.cause"),
            tr("deck_api.template_not_found.message", template_id=template_id),
        )
    return row


def _boards(session: SessionDep) -> list[dict[str, object]]:
    rows, _ = repo.list_boards(session, limit=500)
    return [
        {
            "id": r.id,
            "name": r.name,
            "space_key": r.space_key,
            "space_name": r.space_name or r.space_key,
            "selected": r.selected,
        }
        for r in rows
    ]


@router.get("/catalog")
def fields_catalog(session: SessionDep, template_id: int | None = None) -> JSONDict:
    """The field picker: the fixed catalogue plus the variables this template may use."""
    return {"fields": localized_catalog(catalog(catalog_extras(session, template_id)))}


# ------------------------------------------------------------ variables (RF-45, RF-52)


class VariableBody(BaseModel):
    name: str
    label: str = ""
    description: str = ""
    #: None keeps the variable available to every template; an id binds it to that one.
    template_id: int | None = None
    #: The registration's fallback, and the only place a variable may have one. None means it has
    #: none, so a target that says nothing makes generation fail instead of printing a blank.
    default: str | None = None
    #: RF-58: a Jira catalogue key this variable reads from when no target filled it in.
    source_field: str | None = None


class VariablePatch(BaseModel):
    name: str | None = None
    label: str | None = None
    description: str | None = None
    template_id: int | None = None
    #: True unbinds it from its template, which ``template_id=None`` alone cannot express.
    detach: bool = False
    default: str | None = None
    #: True removes the default, which ``default=None`` alone cannot express — None is also
    #: "leave it alone", and "no default" is not the same as "a default of empty".
    clear_default: bool = False
    source_field: str | None = None
    #: True disconnects the variable from its Jira field, for the same reason as `clear_default`.
    clear_source: bool = False


class VariableValueBody(BaseModel):
    scope: Literal["global", "space", "board", "slide"]
    scope_key: str = ""
    value: str = ""


def _variable_dict(session: SessionDep, row: s.VariableRow) -> JSONDict:
    return {
        "id": row.id,
        "name": row.name,
        "label": row.label,
        "description": row.description,
        "template_id": row.template_id,
        "default": row.default,
        "source_field": row.source_field,
        # RF-59: derived from the source, never stored. It is what decides which binding modes
        # this variable can fill, so the picker needs it on every item.
        "kind": source_kind(row.source_field),
        "placeholder": f"{{{{{FIXED_PREFIX}{row.name}}}}}",
        "created_at": iso(row.created_at),
        "values": [
            {
                "scope": v.scope,
                "scope_key": v.scope_key,
                "value": v.value,
                "updated_at": iso(v.updated_at),
            }
            for v in repo.list_variable_values(session, row.id)
        ],
    }


@router.get("/variables")
def variables(
    session: SessionDep,
    settings: SettingsDep,
    now: Now,
    template_id: int | None = None,
    space_key: str | None = None,
    board_id: int | None = None,
    slide_id: int | None = None,
) -> JSONDict:
    """The variables a template may use, plus what they resolve to for one target.

    ``resolved`` is the whole point: the same name answers with this slide's, this board's, this
    project's or the default value, narrowest first.
    """
    rows = repo.list_variables(session, template_id)
    # Always resolved, even with nothing chosen: the answer is then the global default, which is
    # what an unspecified target really gets.
    resolved = repo.resolve_variables(
        session,
        template_id=template_id,
        space_key=space_key,
        board_id=board_id,
        slide_id=slide_id,
    )
    # RF-58: a variable wired to a Jira field is answered by the deck layer, so the manager asks it
    # the same way the generator will. A typed value still wins — it is already in `resolved`.
    from_jira = resolve_source_fields(session, settings, template_id=template_id, board_id=board_id, now=now)
    typed = set(resolved)
    resolved = {**from_jira, **resolved}
    return {
        "items": [_variable_dict(session, r) for r in rows],
        "resolved": resolved,
        "scope": {
            "template_id": template_id,
            "space_key": space_key,
            "board_id": board_id,
            "slide_id": slide_id,
        },
        "scopes": list(repo.VARIABLE_SCOPES),
        # RF-56: the Jira field catalogue is browsed from the manager, so it travels with it.
        # Same entries, same kinds — nothing is flattened into a text variable on the way.
        "catalog": field_catalog(session, template_id),
        "conflicts": variable_conflicts(session, template_id),
        #: Names whose value on this target came from their Jira field, so the manager can say so
        #: instead of letting it look like somebody typed it.
        "from_source": sorted(k for k in from_jira if k not in typed),
    }


@router.post("/variables", status_code=201)
def create_variable(body: VariableBody, session: SessionDep) -> JSONDict:
    try:
        row = repo.create_variable(
            session,
            name=body.name.strip().lower(),
            label=body.label.strip(),
            description=body.description.strip(),
            template_id=body.template_id,
            default=body.default,
            source_field=check_source_field(body.source_field) if body.source_field else None,
        )
    except Invalid as exc:
        raise HTTPException(
            400,
            detail={
                "cause": tr("deck_api.variable_invalid.cause"),
                "message": str(exc),
                "action": tr("deck_api.variable_invalid.action"),
            },
        ) from None
    return _variable_dict(session, row)


@router.patch("/variables/{variable_id}")
def patch_variable(variable_id: int, body: VariablePatch, session: SessionDep) -> JSONDict:
    try:
        row = repo.update_variable(
            session,
            variable_id,
            name=body.name.strip().lower() if body.name else None,
            label=body.label,
            description=body.description,
            template_id=body.template_id,
            detach=body.detach,
            default=body.default,
            clear_default=body.clear_default,
            source_field=check_source_field(body.source_field) if body.source_field else None,
            clear_source=body.clear_source,
        )
    except Invalid as exc:
        raise HTTPException(
            400, detail={"cause": tr("deck_api.variable_invalid.cause"), "message": str(exc)}
        ) from None
    if row is None:
        raise not_found(tr("deck_api.variable_not_found.cause"), str(variable_id))
    return _variable_dict(session, row)


@router.delete("/variables/{variable_id}", status_code=204)
def delete_variable(variable_id: int, session: SessionDep) -> None:
    if not repo.delete_variable(session, variable_id):
        raise not_found(tr("deck_api.variable_not_found.cause"), str(variable_id))


@router.put("/variables/{variable_id}/values")
def set_variable_value(variable_id: int, body: VariableValueBody, session: SessionDep) -> JSONDict:
    try:
        check_writable(session, variable_id)
        repo.set_variable_value(
            session,
            variable_id,
            scope=body.scope,
            scope_key=body.scope_key.strip(),
            value=body.value,
        )
    except Invalid as exc:
        raise HTTPException(
            400, detail={"cause": tr("deck_api.value_invalid.cause"), "message": str(exc)}
        ) from None
    row = repo.get_variable(session, variable_id)
    return _variable_dict(session, row) if row else {}


@router.delete("/variables/{variable_id}/values", status_code=204)
def clear_variable_value(variable_id: int, session: SessionDep, scope: str, scope_key: str = "") -> None:
    if not repo.clear_variable_value(session, variable_id, scope, scope_key):
        raise not_found(tr("deck_api.value_not_found.cause"), f"{scope}:{scope_key}")


@router.get("/templates")
def templates(session: SessionDep) -> JSONDict:
    items = []
    for row in repo.list_templates(session):
        mapping = repo.get_mapping(session, row.id)
        items.append(
            {
                "id": row.id,
                "name": row.name,
                "filename": row.filename,
                "sha256": row.sha256,
                "uploaded_at": iso(row.uploaded_at),
                "slides": row.manifest.get("template", {}).get("slides"),
                "has_mapping": mapping is not None,
                "has_edits": session.get(s.DeckEditRow, row.id) is not None,
                "runs": repo.runs_for_template(session, row.id),
                "size": Path(row.path).stat().st_size if row.path and Path(row.path).is_file() else None,
                "missing_file": not (row.path and Path(row.path).is_file()),
            }
        )
    return {"items": items}


@router.post("/templates", status_code=201)
async def upload_template(
    session: SessionDep,
    settings: SettingsDep,
    file: Annotated[UploadFile, File()],
    name: Annotated[str | None, Form()] = None,
) -> JSONDict:
    filename = file.filename or "modelo.pptx"
    if not filename.lower().endswith(".pptx"):
        raise HTTPException(
            400,
            detail={
                "cause": tr("deck_api.format_invalid.cause"),
                "message": tr("deck_api.format_invalid.message"),
            },
        )
    content = await _read_capped(
        file, settings.template_max_mb * 1024 * 1024, tr("deck_api.template_too_large.cause")
    )
    row = store_template(session, settings, filename, content, name)
    return {"id": row.id, "name": row.name, "sha256": row.sha256}


@router.delete("/templates/{template_id}")
def delete_template(template_id: int, session: SessionDep, settings: SettingsDep) -> JSONDict:
    """Remove a template with its mapping and manual edits. Generated decks are kept."""
    row = _template(session, template_id)
    return remove_template(session, settings, row)


@router.get("/templates/{template_id}")
def template_detail(template_id: int, session: SessionDep) -> JSONDict:
    row = _template(session, template_id)
    mapping = repo.get_mapping(session, template_id)
    saved = mapping.mapping if mapping else None
    missing = (
        sorted(set(DeckMapping.model_validate(saved).targets()) - target_ids(row.manifest)) if saved else []
    )
    return {
        "id": row.id,
        "name": row.name,
        "filename": row.filename,
        "sha256": row.sha256,
        "manifest": row.manifest,
        "mapping": saved,
        "mapping_sha256": mapping.template_sha256 if mapping else None,
        "mapping_outdated": bool(mapping and mapping.template_sha256 != row.sha256),
        "missing_targets": missing,
        "suggestion": localize(suggest_mapping(row.manifest, _boards(session))),
        "boards": _boards(session),
    }


@router.get("/templates/{template_id}/previews")
def template_preview_list(template_id: int, session: SessionDep, settings: SettingsDep) -> JSONDict:
    """Slide images of the template, rendered on the first request and cached by version."""
    return template_previews(settings, _template(session, template_id))


@router.get("/templates/{template_id}/previews/{name}")
def template_preview_file(
    template_id: int, name: str, session: SessionDep, settings: SettingsDep
) -> FileResponse:
    row = _template(session, template_id)
    return FileResponse(stored_file(settings.templates_dir, row.sha256, name))


@router.get("/preview")
def preview_values(
    session: SessionDep,
    settings: SettingsDep,
    now: Now,
    board_id: int | None = None,
    reference: str | None = None,
) -> JSONDict:
    """What each catalogue field holds for one board, to show beside the field picker (RF-38)."""
    return preview_fields(
        session,
        settings,
        board_id=board_id,
        reference=parse_instant(reference, now) if reference else None,
        now=now,
    )


class SlidePreviewBody(BaseModel):
    """The draft mapping, so the preview follows the edit instead of the last save."""

    mapping: DeckMapping
    board_id: int | None = None
    reference: str | None = None


@router.post("/templates/{template_id}/slides/{slide_id}/preview")
def slide_preview_route(
    template_id: int,
    slide_id: int,
    body: SlidePreviewBody,
    session: SessionDep,
    settings: SettingsDep,
    now: Now,
) -> JSONDict:
    """What this slide will actually say, resolved exactly as the generator will resolve it."""
    row = _template(session, template_id)
    try:
        return preview_slide(
            session,
            settings,
            row,
            slide_id=slide_id,
            mapping=body.mapping,
            board_id=body.board_id,
            reference=parse_instant(body.reference, now) if body.reference else None,
            now=now,
        )
    except NotFound:
        raise not_found(
            tr("deck_api.slide_not_found.cause"),
            tr("deck_api.slide_not_found.message", slide_id=slide_id, template_id=template_id),
        ) from None


@router.post("/templates/{template_id}/refresh")
def refresh_template(template_id: int, session: SessionDep) -> JSONDict:
    """Re-read the stored .pptx: an older upload gains whatever the manifest learned since."""
    row = _template(session, template_id)
    path = Path(row.path)
    if not path.exists():
        raise not_found(tr("deck_api.template_file_not_found.cause"), row.filename)
    before = row.manifest.get("version")
    manifest = extract_manifest(path)
    manifest["template"]["filename"] = row.filename
    row.manifest = manifest
    return {"refreshed": True, "from_version": before, "version": manifest["version"]}


@router.put("/templates/{template_id}/mapping")
def save_mapping(template_id: int, body: DeckMapping, session: SessionDep, request: Request) -> JSONDict:
    row = _template(session, template_id)
    unknown = sorted(set(body.targets()) - target_ids(row.manifest))
    if unknown:
        raise HTTPException(
            400,
            detail={
                "cause": tr("deck_api.unknown_areas.cause"),
                "message": ", ".join(unknown[:10]),
                "targets": unknown,
            },
        )
    repo.save_mapping(session, template_id, row.sha256, body.model_dump())
    repo.record_version(session, template_id, "mapping", body.model_dump(), author=author_of(request))
    return {"saved": True}


class CloneMappingBody(BaseModel):
    from_template_id: int
    aplicar: bool = False


@router.post("/templates/{template_id}/clone-mapping")
def clone_mapping(
    template_id: int, body: CloneMappingBody, session: SessionDep, request: Request
) -> JSONDict:
    """#13: carry a mapping over to a redesigned template, matched by slide position and shape
    name. Reports what would move; only writes when ``aplicar`` is true, mirroring
    `plan_binding_migration`/`apply_binding_migration`."""
    to_row = _template(session, template_id)
    from_row = _template(session, body.from_template_id)
    from_mapping_row = repo.get_mapping(session, body.from_template_id)
    if from_mapping_row is None:
        raise Invalid(Msg("deck_api.clone_without_mapping"))
    cloned, plan = apply_mapping_clone(from_row.manifest, from_mapping_row.mapping, to_row.manifest)
    result: JSONDict = {"matched": len(plan["matched"]), "unmatched": plan["unmatched"]}
    if not body.aplicar:
        return result
    mapping = DeckMapping.model_validate(cloned)
    unknown = sorted(set(mapping.targets()) - target_ids(to_row.manifest))
    if unknown:
        raise HTTPException(
            400, detail={"cause": tr("deck_api.area_lost_after_remap.cause"), "targets": unknown}
        )
    repo.save_mapping(session, template_id, to_row.sha256, mapping.model_dump())
    repo.record_version(session, template_id, "mapping", mapping.model_dump(), author=author_of(request))
    result["saved"] = True
    return result


# ------------------------------------------------------------ fonts (RF-47)


@router.get("/fonts")
def fonts(session: SessionDep, template_id: int | None = None) -> JSONDict:
    """Which metric-compatible faces the editor can load for the fonts this deck uses."""
    families: list[str] = []
    rows = [_template(session, template_id)] if template_id is not None else repo.list_templates(session)
    for row in rows:
        theme_fonts = (row.manifest.get("theme") or {}).get("fonts") or {}
        families += [str(v) for v in theme_fonts.values() if v]
        for slide in row.manifest.get("slides", []):
            for area in slide.get("areas", []):
                families += [p.get("font") for p in area.get("paragraphs", []) if p.get("font")]
    return font_plan(families)


@router.get("/fonts/{face}/{variant}")
def font_file(face: str, variant: str) -> FileResponse:
    path = face_file(face, variant)
    if path is None:
        raise not_found(tr("deck_api.font_unavailable.cause"), f"{face} {variant}")
    media = "font/otf" if path.suffix.lower() == ".otf" else "font/ttf"
    return FileResponse(path, media_type=media, headers={"Cache-Control": "max-age=604800"})


# ------------------------------------------------------------ the editor (RF-46, RF-47)


class PaletteBody(BaseModel):
    palette: dict[str, str] | None = None
    status_labels: dict[str, str] | None = None


@router.get("/palette")
def read_palette(session: SessionDep) -> JSONDict:
    """RF-62: the status colours and words, configured once for the whole install."""
    palette, labels = repo.deck_palette(session)
    return {"palette": palette, "status_labels": labels, "statuses": list(DECK_STATUSES)}


@router.put("/palette")
def write_palette(body: PaletteBody, session: SessionDep) -> JSONDict:
    repo.set_deck_palette(session, body.palette, body.status_labels)
    palette, labels = repo.deck_palette(session)
    return {"palette": palette, "status_labels": labels, "statuses": list(DECK_STATUSES)}


@router.get("/palette/accessible")
def suggest_accessible_palette() -> JSONDict:
    """#5: a suggestion only — the person still reviews and saves it with `PUT /palette`."""
    return {"palette": dict(COLORBLIND_SAFE_PALETTE)}


@router.get("/templates/{template_id}/readiness")
def template_readiness_route(
    template_id: int, session: SessionDep, settings: SettingsDep, now: Now
) -> JSONDict:
    """RF-66: what would be wrong with the deck, per slide, before anything is generated."""
    try:
        return template_readiness(session, settings, template_id, now)
    except NotFound:
        raise not_found(tr("deck_api.template_not_found.cause"), str(template_id)) from None


@router.get("/templates/{template_id}/scene")
def template_scene_route(template_id: int, session: SessionDep) -> JSONDict:
    """RF-61: the template as a scene, so one renderer draws the template and the run alike."""
    row = session.get(s.TemplateRow, template_id)
    if row is None:
        raise not_found(tr("deck_api.template_not_found.cause"), str(template_id))
    try:
        return template_scene(session, row)
    except NotFound:
        raise not_found(tr("deck_api.template_file_gone.cause"), str(template_id)) from None


@router.get("/templates/{template_id}/images/{shape_key}")
def template_shape_image(template_id: int, shape_key: str, session: SessionDep) -> Response:
    """A picture embedded in the template, for the canvas drawing it."""
    row = session.get(s.TemplateRow, template_id)
    if row is None:
        raise not_found(tr("deck_api.template_not_found.cause"), str(template_id))
    blob = template_picture(row, shape_key)
    if blob is None:
        raise not_found(tr("deck_api.template_image_not_found.cause"), shape_key)
    content, content_type = blob
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "max-age=3600"})


@router.get("/runs/{run_id}/scene")
def run_scene_route(run_id: str, session: SessionDep) -> JSONDict:
    """The generated deck as an editable scene: every shape with the geometry the file holds."""
    row = session.get(s.ReportRunRow, run_id)
    if row is None:
        raise not_found(tr("deck_api.run_not_found.cause"), run_id)
    try:
        return run_scene(session, row)
    except NotFound:
        raise not_found(tr("deck_api.run_file_not_found.cause"), run_id) from None


class ReassociateBody(BaseModel):
    template_id: int


@router.post("/runs/{run_id}/reassociate")
def reassociate_run_route(run_id: str, body: ReassociateBody, session: SessionDep) -> JSONDict:
    """#12: relink an orphaned run (its template deleted) to a re-uploaded one."""
    row = session.get(s.ReportRunRow, run_id)
    if row is None:
        raise not_found(tr("deck_api.run_not_found.cause"), run_id)
    reassociate_run(session, row, body.template_id)
    return run_scene(session, row)


@router.get("/templates/{template_id}/edits")
def get_edits(template_id: int, session: SessionDep) -> JSONDict:
    _template(session, template_id)
    row = session.get(s.DeckEditRow, template_id)
    return {
        "edits": load_edits(session, template_id).model_dump(),
        "revision": row.revision if row else 0,
        "updated_at": iso(row.updated_at) if row else None,
    }


class EditsBody(BaseModel):
    edits: DeckEdits
    #: The revision the editor started from. A mismatch means somebody else saved in between.
    base_revision: int | None = None
    #: True replaces the document; false merges shape by shape, for an autosave of one change.
    replace: bool = True
    #: Who is editing, when nginx does not already say (RF-87's versions carry it).
    author: str | None = None


@router.put("/templates/{template_id}/edits")
def put_edits(template_id: int, body: EditsBody, session: SessionDep, now: Now, request: Request) -> JSONDict:
    _template(session, template_id)
    row = session.get(s.DeckEditRow, template_id)
    current = row.revision if row else 0
    if body.base_revision is not None and body.base_revision != current:
        raise HTTPException(
            409,
            detail={
                "cause": tr("deck_api.edits_conflict.cause"),
                "action": tr("deck_api.edits_conflict.action"),
                "revision": current,
            },
        )
    edits = body.edits if body.replace else merge_edits(load_edits(session, template_id), body.edits)
    saved = save_edits(session, template_id, edits, now, author=author_of(request, body.author))
    return {"saved": True, "revision": saved.revision, "edits": edits.model_dump()}


@router.delete("/templates/{template_id}/edits", status_code=204)
def clear_edits(template_id: int, session: SessionDep, now: Now) -> None:
    """Throw the manual layer away and go back to what the data alone produces."""
    _template(session, template_id)
    save_edits(session, template_id, DeckEdits(), now)


@router.post("/assets", status_code=201)
async def upload_asset(
    session: SessionDep, settings: SettingsDep, file: Annotated[UploadFile, File()]
) -> JSONDict:
    content = await _read_capped(file, ASSET_MAX_BYTES, tr("deck_api.image_too_large.cause"))
    row = store_asset(session, settings, file.filename or "imagem.png", content)
    return {
        "id": row.id,
        "filename": row.filename,
        "content_type": row.content_type,
        "width": row.width,
        "height": row.height,
        "url": f"/api/reports/assets/{row.id}",
    }


@router.get("/assets/{asset_id}")
def get_asset(asset_id: str, session: SessionDep) -> FileResponse:
    row = session.get(s.AssetRow, asset_id)
    if row is None or not Path(row.path).exists():
        raise not_found(tr("deck_api.image_not_found.cause"), asset_id)
    if row.content_type in IMAGE_TYPES:
        return FileResponse(row.path, media_type=row.content_type)
    # Stored before uploads were checked: hand it over as a download, never as a page of this app.
    return FileResponse(row.path, media_type="application/octet-stream", filename=row.filename)


@router.get("/assets")
def list_assets(session: SessionDep, q: str = "", tag: str = "") -> JSONDict:
    """#17: the image library, newest first, searchable by name/label and filtered by tag."""
    from cadencia.report.library import asset_dict, asset_tags, search_assets

    return {"items": [asset_dict(r) for r in search_assets(session, q, tag)], "tags": asset_tags(session)}


@router.get("/runs/{run_id}/images/{shape_key}")
def run_shape_image(run_id: str, shape_key: str, session: SessionDep) -> Response:
    """The bitmap of a picture already on a generated slide, so the canvas can draw it."""
    row = session.get(s.ReportRunRow, run_id)
    if row is None or not row.path or not Path(row.path).exists():
        raise not_found(tr("deck_api.run_not_found.cause"), run_id)
    blob = picture_blob(row.path, shape_key)
    if blob is None:
        raise not_found(tr("deck_api.slide_image_not_found.cause"), shape_key)
    content, content_type = blob
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "max-age=3600"})


class GenerateBody(BaseModel):
    template_id: int
    reference: str | None = None
    board_ids: list[int] | None = None
    anonymize: bool | None = None
    render: bool = True
    #: RF-71: also send it to the channels subscribed to "deck".
    notify: bool = False
    #: #25: generate the variant for this audience ("" = every slide).
    audience: str = ""


@router.post("/generate", status_code=201)
def generate(body: GenerateBody, session: SessionDep, settings: SettingsDep, now: Now) -> JSONDict:
    run = generate_report(
        session,
        settings,
        body.template_id,
        reference=parse_instant(body.reference, now) if body.reference else None,
        board_ids=body.board_ids,
        anonymize=body.anonymize,
        render=body.render,
        now=now,
        audience=body.audience,
    )
    out = run_dict(run)
    if body.notify:
        template = _template(session, body.template_id)
        out["delivery"] = notify.deliver(session, settings, notify.deck_message(settings, run, template.name))
    return out


@router.get("/runs")
def runs(session: SessionDep, template_id: int | None = None, kind: str = "entrega") -> JSONDict:
    """Generated decks, newest first. Previews and partial runs are asked for by ``kind``."""
    stmt = (
        select(s.ReportRunRow)
        .where(s.ReportRunRow.kind == kind)
        .order_by(s.ReportRunRow.created_at.desc())
        .limit(100)
    )
    if template_id is not None:
        stmt = stmt.where(s.ReportRunRow.template_id == template_id)
    return {"items": [run_dict(r) for r in session.scalars(stmt)]}


@router.get("/runs/{run_id}/download")
def download(run_id: str, session: SessionDep, force: bool = False) -> FileResponse:
    row = session.get(s.ReportRunRow, run_id)
    if row is None or not row.path or not Path(row.path).exists():
        raise not_found(
            tr("deck_api.deck_not_found.cause"), tr("deck_api.deck_not_found.message", run_id=run_id)
        )
    blocker = download_blocker(session, row)
    if blocker and not force:
        raise HTTPException(409, detail=blocker)
    filename = f"cadencia-{row.reference_at:%Y-%m-%d}-{row.id}.pptx"
    return FileResponse(row.path, media_type=PPTX, filename=filename)


@router.get("/runs/{run_id}/files/{name}")
def run_file(run_id: str, name: str, settings: SettingsDep) -> FileResponse:
    return FileResponse(stored_file(settings.decks_dir, run_id, name))


# ------------------------------------------------------------ versions (RF-87)


def _version_dict(row: s.DeckVersionRow) -> JSONDict:
    return {
        "id": row.id,
        "template_id": row.template_id,
        "kind": row.kind,
        "label": row.label,
        "auto": row.auto,
        "author": row.author,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def _version(session: SessionDep, version_id: int) -> s.DeckVersionRow:
    row = session.get(s.DeckVersionRow, version_id)
    if row is None:
        raise not_found(
            tr("deck_api.version_not_found.cause"),
            tr("deck_api.version_not_found.message", version_id=version_id),
        )
    return row


@router.get("/templates/{template_id}/versions")
def versions(
    template_id: int, session: SessionDep, kind: Literal["edits", "mapping"] | None = None
) -> JSONDict:
    _template(session, template_id)
    return {"items": [_version_dict(r) for r in repo.list_versions(session, template_id, kind)]}


class VersionBody(BaseModel):
    kind: Literal["edits", "mapping"]
    label: str
    author: str | None = None


@router.post("/templates/{template_id}/versions", status_code=201)
def create_version(
    template_id: int, body: VersionBody, session: SessionDep, request: Request, now: Now
) -> JSONDict:
    """Keep the current state under a name, where autosave's rolling copies will never prune it."""
    _template(session, template_id)
    if not body.label.strip():
        raise HTTPException(
            400,
            detail={
                "cause": tr("deck_api.version_name_missing.cause"),
                "message": tr("deck_api.version_name_missing.message"),
            },
        )
    row = repo.record_version(
        session,
        template_id,
        body.kind,
        current_document(session, template_id, body.kind),
        label=body.label,
        auto=False,
        author=author_of(request, body.author),
        now=now,
    )
    return _version_dict(row)


@router.get("/versions/{version_id}")
def version_detail(version_id: int, session: SessionDep) -> JSONDict:
    row = _version(session, version_id)
    current = current_document(session, row.template_id, row.kind)
    return {
        **_version_dict(row),
        "document": row.document,
        "diff": version_diff(row.kind, current, row.document),
    }


class VersionPatch(BaseModel):
    label: str


@router.patch("/versions/{version_id}")
def rename_version(version_id: int, body: VersionPatch, session: SessionDep) -> JSONDict:
    row = _version(session, version_id)
    row.label, row.auto = body.label.strip()[:255], False  # a named version is one somebody keeps
    return _version_dict(row)


class RestoreBody(BaseModel):
    author: str | None = None


@router.post("/versions/{version_id}/restore")
def restore(version_id: int, body: RestoreBody, session: SessionDep, request: Request, now: Now) -> JSONDict:
    row = _version(session, version_id)
    template = _template(session, row.template_id)
    return restore_version(session, template, row, now, author_of(request, body.author))


@router.delete("/versions/{version_id}", status_code=204)
def delete_version(version_id: int, session: SessionDep) -> None:
    session.delete(_version(session, version_id))


# ------------------------------------------------------------ comments (RF-93)


def _comment_dict(row: s.DeckCommentRow) -> JSONDict:
    return {
        "id": row.id,
        "origin_slide_id": row.origin_slide_id,
        "shape_key": row.shape_key,
        "parent_id": row.parent_id,
        "author": row.author,
        "body": row.body,
        "created_at": iso(row.created_at),
        "resolved_at": iso(row.resolved_at),
    }


@router.get("/templates/{template_id}/comments")
def comments(template_id: int, session: SessionDep) -> JSONDict:
    _template(session, template_id)
    rows = repo.list_comments(session, template_id)
    open_threads = sum(1 for r in rows if r.parent_id is None and r.resolved_at is None)
    return {"items": [_comment_dict(r) for r in rows], "open": open_threads}


class CommentBody(BaseModel):
    origin_slide_id: int = 0
    shape_key: str | None = None
    parent_id: int | None = None
    body: str
    author: str | None = None


@router.post("/templates/{template_id}/comments", status_code=201)
def add_comment(template_id: int, body: CommentBody, session: SessionDep, request: Request) -> JSONDict:
    _template(session, template_id)
    row = repo.add_comment(
        session,
        template_id,
        origin_slide_id=body.origin_slide_id,
        shape_key=body.shape_key,
        parent_id=body.parent_id,
        body=body.body,
        author=author_of(request, body.author) or "",
    )
    return _comment_dict(row)


class CommentPatch(BaseModel):
    resolved: bool


@router.patch("/comments/{comment_id}")
def resolve_comment(comment_id: int, body: CommentPatch, session: SessionDep) -> JSONDict:
    return _comment_dict(repo.resolve_comment(session, comment_id, body.resolved))


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, session: SessionDep) -> None:
    if not repo.delete_comment(session, comment_id):
        raise not_found(tr("deck_api.comment_not_found.cause"), str(comment_id))


# ------------------------------------------------------------ find & replace in variables (RF-88)


class ReplaceBody(BaseModel):
    find: str
    replace: str = ""
    match_case: bool = False
    template_id: int | None = None
    #: False previews the matches; true writes them.
    apply: bool = False


@router.post("/variables/replace")
def replace_variables(body: ReplaceBody, session: SessionDep) -> JSONDict:
    return replace_in_variables(
        session,
        body.find,
        body.replace,
        match_case=body.match_case,
        template_id=body.template_id,
        apply=body.apply,
    )
