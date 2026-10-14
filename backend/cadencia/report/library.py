"""The Apresentação library and housekeeping: reusable blocks (#16), the image library (#17),
editor presence (#19), per-slide history (#20), template diagnostics (#24) and usage (#30)."""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from cadencia.errors import Invalid, NotFound
from cadencia.i18n import Msg, tr
from cadencia.report.core.a11y import audit
from cadencia.report.core.context import spec_for
from cadencia.report.core.edits import DeckEdits, ShapeEdit, SlideEdits
from cadencia.report.core.fonts import font_plan
from cadencia.report.core.text import marker_base
from cadencia.report.service import (
    load_edits,
    load_mapping,
    save_edits,
    template_scene,
    variable_registry,
)
from cadencia.store import repo
from cadencia.store import schema as s

# ---------------------------------------------------------------- blocks (#16)


def block_dict(row: s.DeckBlockRow) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "author": row.author,
        "shapes": row.shapes,
        "width": row.width,
        "height": row.height,
        "created_at": row.created_at.isoformat(),
        "usage_count": row.usage_count,
        "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
    }


def create_block(
    session: Session, *, name: str, description: str, author: str | None, shapes: Mapping[str, Any]
) -> s.DeckBlockRow:
    """Save shapes as a block. Frames are made relative to the block's corner, so it lands
    wherever it is dropped; only inserted shapes travel (a template's own shape has no meaning
    in another template)."""
    if not name.strip():
        raise Invalid(Msg("library.block.name_required"))
    edits = {key: ShapeEdit.model_validate(value) for key, value in shapes.items()}
    edits = {key: e for key, e in edits.items() if e.op == "insert" and e.frame is not None}
    if not edits:
        raise Invalid(Msg("library.block.no_shapes"))
    left = min(e.frame.x or 0 for e in edits.values())  # type: ignore[union-attr]
    top = min(e.frame.y or 0 for e in edits.values())  # type: ignore[union-attr]
    right = max((e.frame.x or 0) + (e.frame.cx or 0) for e in edits.values())  # type: ignore[union-attr]
    bottom = max((e.frame.y or 0) + (e.frame.cy or 0) for e in edits.values())  # type: ignore[union-attr]
    relative = {}
    for key, edit in edits.items():
        frame = edit.frame.model_copy(
            update={"x": (edit.frame.x or 0) - left, "y": (edit.frame.y or 0) - top}
        )  # type: ignore[union-attr]
        relative[key] = edit.model_copy(update={"frame": frame, "z": None}).model_dump(exclude_none=True)
    row = s.DeckBlockRow(
        name=name.strip()[:120],
        description=description.strip(),
        author=author,
        shapes=relative,
        width=right - left,
        height=bottom - top,
        created_at=datetime.now(UTC),
    )
    session.add(row)
    session.flush()
    return row


def list_blocks(session: Session) -> list[s.DeckBlockRow]:
    """#29: the most-used blocks first, so a library that grows past a screenful still surfaces
    someone's favourites instead of making them scroll the same alphabetical list every time."""
    rows = list(session.scalars(select(s.DeckBlockRow)))
    return sorted(rows, key=lambda r: (-r.usage_count, r.name.casefold()))


def use_block(session: Session, block_id: int) -> s.DeckBlockRow:
    """Record that a block was just dropped onto a slide (#29)."""
    row = session.get(s.DeckBlockRow, block_id)
    if row is None:
        raise NotFound(block_id, Msg("library.block.not_found"))
    row.usage_count += 1
    row.last_used_at = datetime.now(UTC)
    session.flush()
    return row


def delete_block(session: Session, block_id: int) -> None:
    if session.get(s.DeckBlockRow, block_id) is None:
        raise NotFound(block_id, Msg("library.block.not_found"))
    session.execute(delete(s.DeckBlockRow).where(s.DeckBlockRow.id == block_id))


# ---------------------------------------------------------------- image library (#17)


def asset_dict(row: s.AssetRow) -> dict[str, Any]:
    return {
        "id": row.id,
        "filename": row.filename,
        "label": row.label or "",
        "tags": list(row.tags or []),
        "content_type": row.content_type,
        "width": row.width,
        "height": row.height,
        "uploaded_at": row.uploaded_at.isoformat(),
        "url": f"/api/reports/assets/{row.id}",
    }


def search_assets(session: Session, query: str = "", tag: str = "", limit: int = 200) -> list[s.AssetRow]:
    stmt = select(s.AssetRow).order_by(s.AssetRow.uploaded_at.desc())
    if query.strip():
        like = f"%{query.strip().lower()}%"
        stmt = stmt.where(
            or_(func.lower(s.AssetRow.filename).like(like), func.lower(s.AssetRow.label).like(like))
        )
    rows = list(session.scalars(stmt.limit(limit * 3)))
    if tag.strip():
        wanted = tag.strip().casefold()
        rows = [r for r in rows if wanted in {str(t).casefold() for t in r.tags or []}]
    return rows[:limit]


def update_asset(
    session: Session, asset_id: str, *, label: str | None, tags: Sequence[str] | None
) -> s.AssetRow:
    row = session.get(s.AssetRow, asset_id)
    if row is None:
        raise NotFound(asset_id, Msg("library.image.not_found"))
    if label is not None:
        row.label = label.strip()[:160]
    if tags is not None:
        row.tags = sorted({t.strip() for t in tags if t.strip()}, key=str.casefold)[:20]
    session.flush()
    return row


def asset_tags(session: Session) -> list[str]:
    counts: Counter[str] = Counter()
    for tags in session.scalars(select(s.AssetRow.tags)):
        counts.update(str(t) for t in tags or [])
    return [t for t, _ in counts.most_common(40)]


# ---------------------------------------------------------------- presence (#19)

#: A beat older than this means the person closed the editor or lost the connection.
PRESENCE_SECONDS = 45


def beat(
    session: Session, template_id: int, author: str, slide_key: str, now: datetime
) -> list[dict[str, Any]]:
    """Record that ``author`` is on ``slide_key`` now; answer who else is here.

    An upsert, not get-then-add: two beats of the same editor can arrive together (two tabs, or a
    remounted effect), and the loser of a read-then-insert race would answer 500."""
    repo.upsert(
        session,
        s.EditorPresenceRow,
        [{"template_id": template_id, "author": author, "slide_key": slide_key, "seen_at": now}],
        ["template_id", "author"],
    )
    fresh = now - timedelta(seconds=PRESENCE_SECONDS)
    session.execute(delete(s.EditorPresenceRow).where(s.EditorPresenceRow.seen_at < now - timedelta(hours=1)))
    others = session.scalars(
        select(s.EditorPresenceRow).where(
            s.EditorPresenceRow.template_id == template_id,
            s.EditorPresenceRow.author != author,
            s.EditorPresenceRow.seen_at >= fresh,
        )
    )
    return [{"author": o.author, "slide_key": o.slide_key, "seen_at": o.seen_at.isoformat()} for o in others]


def leave(session: Session, template_id: int, author: str) -> None:
    session.execute(
        delete(s.EditorPresenceRow).where(
            s.EditorPresenceRow.template_id == template_id, s.EditorPresenceRow.author == author
        )
    )


# ---------------------------------------------------------------- per-slide history (#20)


def slide_history(session: Session, template_id: int, key: str) -> list[dict[str, Any]]:
    """Every saved version in which this slide looked different from the version before it."""
    versions = sorted(repo.list_versions(session, template_id, "edits"), key=lambda v: (v.created_at, v.id))
    out = []
    previous: Any = None
    for version in versions:
        slide = (version.document.get("slides") or {}).get(key)
        if slide != previous:
            out.append(
                {
                    "version_id": version.id,
                    "label": version.label,
                    "auto": version.auto,
                    "author": version.author,
                    "at": version.updated_at.isoformat(),
                    "removed": slide is None,
                }
            )
        previous = slide
    return list(reversed(out))


def restore_slide(
    session: Session, template_id: int, version_id: int, key: str, now: datetime, author: str | None
) -> DeckEdits:
    """Put one slide back as ``version`` had it; every other slide stays as it is now."""
    version = session.get(s.DeckVersionRow, version_id)
    if version is None or version.template_id != template_id or version.kind != "edits":
        raise NotFound(version_id, Msg("library.version.not_found"))
    current = load_edits(session, template_id)
    repo.record_version(
        session,
        template_id,
        "edits",
        current.model_dump(),
        label=tr("library.version.before_restoring_slide", key=key),
        auto=False,
        author=author,
        now=now,
    )
    old = (version.document.get("slides") or {}).get(key)
    slides = dict(current.slides)
    if old is None:
        slides.pop(key, None)
    else:
        slides[key] = SlideEdits.model_validate(old)
    restored = current.model_copy(update={"slides": slides})
    save_edits(session, template_id, restored, now, author=author)
    return restored


# ---------------------------------------------------------------- template diagnostics (#24)


def template_diagnostics(session: Session, template: s.TemplateRow) -> dict[str, Any]:
    """What to fix in a template before its first deck: fonts that will be measured wrong, areas
    nothing fills, markers nothing answers, slides with no name and silent pictures."""
    manifest = template.manifest or {}
    mapping = load_mapping(session, template.id)
    registry = variable_registry(session, template.id)
    bound = set(mapping.targets())
    families: list[str] = [str(v) for v in ((manifest.get("theme") or {}).get("fonts") or {}).values() if v]
    unbound, orphans, unnamed = [], [], []
    for slide in manifest.get("slides", []):
        spec = mapping.for_slide(slide["slide_id"])
        if spec.action == "remove":
            continue
        if not spec.name and not (slide.get("headline") or "").strip():
            unnamed.append(slide["index"])
        for area in slide.get("areas", []):
            families += [p.get("font") for p in area.get("paragraphs", []) if p.get("font")]
            ids = {t["id"] for t in area.get("targets", [])} | {area["id"]}
            fillable = area.get("kind") in {"text", "table", "chart", "picture", "shape"}
            if fillable and not ids & bound and not area.get("markers"):
                unbound.append({"slide": slide["index"], "area": area["id"], "name": area.get("name", "")})
            for marker in area.get("markers", []):
                if spec_for(marker_base(marker), registry) is None:
                    orphans.append({"slide": slide["index"], "area": area["id"], "marker": marker})
    fonts = [f for f in font_plan([f for f in families if f])["families"] if not f["metric_compatible"]]
    silent = [f for f in audit(template_scene(session, template)) if f["kind"] == "sem_texto_alternativo"]
    size_mb = (
        round(Path(template.path).stat().st_size / 1_048_576, 2) if Path(template.path).exists() else None
    )
    checks = [
        ("fontes", "aviso", tr("library.diagnostics.fonts", count=len(fonts)), fonts),
        ("marcadores_orfaos", "erro", tr("library.diagnostics.orphan_markers", count=len(orphans)), orphans),
        ("areas_sem_vinculo", "info", tr("library.diagnostics.unbound_areas", count=len(unbound)), unbound),
        ("slides_sem_nome", "info", tr("library.diagnostics.unnamed_slides", count=len(unnamed)), unnamed),
        ("imagens_sem_alt", "aviso", tr("library.diagnostics.silent_images", count=len(silent)), silent),
    ]
    return {
        "template_id": template.id,
        "size_mb": size_mb,
        "slides": len(manifest.get("slides", [])),
        "checks": [
            {"id": key, "severity": severity, "message": message, "items": items[:50], "count": len(items)}
            for key, severity, message, items in checks
            if items
        ],
    }


# ---------------------------------------------------------------- usage (#30)


def record_presentation(session: Session, run: s.ReportRunRow, seconds: Mapping[str, float]) -> None:
    """Seconds spent on each slide (by slide key) during one presentation, kept with the run."""
    validation = dict(run.validation or {})
    sessions = list(validation.get("presented") or [])
    sessions.append({str(k): round(float(v), 1) for k, v in seconds.items() if float(v) >= 0})
    validation["presented"] = sessions[-10:]
    run.validation = validation
    session.flush()


def template_usage(session: Session, template_id: int, last: int = 20) -> dict[str, Any]:
    """How a template behaves over its recent decks, to trim it with data rather than taste."""
    runs = list(
        session.scalars(
            select(s.ReportRunRow)
            .where(s.ReportRunRow.template_id == template_id, s.ReportRunRow.kind == "entrega")
            .order_by(s.ReportRunRow.created_at.desc())
            .limit(last)
        )
    )
    template = session.get(s.TemplateRow, template_id)
    manifest = template.manifest if template is not None else {}
    mapping = load_mapping(session, template_id)
    names = {
        sl["slide_id"]: mapping.for_slide(sl["slide_id"]).name or sl.get("headline") or f"Slide {sl['index']}"
        for sl in (manifest or {}).get("slides", [])
    }
    problems: Counter[str] = Counter()
    dropped: Counter[int] = Counter()
    presented_time: dict[int, list[float]] = {}
    for run in runs:
        validation = run.validation or {}
        problems.update(e.get("kind", "") for e in validation.get("errors") or [])
        problems.update(w.get("kind", "") for w in validation.get("warnings") or [])
        dropped.update(int(d) for d in validation.get("dropped") or [])
        for presentation in validation.get("presented") or []:
            for key, seconds in presentation.items():
                origin = int(str(key).split(":")[0]) if str(key).split(":")[0].isdigit() else None
                if origin is not None:
                    presented_time.setdefault(origin, []).append(seconds)
    seconds = [r.seconds for r in runs if r.seconds]
    suggestions = []
    for origin, count in dropped.most_common():
        if runs and count >= max(2, 0.8 * len(runs)):
            suggestions.append(
                tr(
                    "library.usage.often_empty",
                    name=str(names.get(origin, origin)),
                    count=count,
                    runs=len(runs),
                )
            )
    for origin, times in presented_time.items():
        if len(times) >= 2 and sum(times) / len(times) < 3:
            suggestions.append(tr("library.usage.skipped", name=str(names.get(origin, origin))))
    return {
        "runs": len(runs),
        "ok": sum(1 for r in runs if r.status == "ok"),
        "seconds_avg": round(sum(seconds) / len(seconds), 1) if seconds else None,
        "seconds_max": max(seconds) if seconds else None,
        "problems": [{"kind": k, "count": n} for k, n in problems.most_common(12) if k],
        "dropped": [
            {"slide_id": k, "name": names.get(k, str(k)), "count": n} for k, n in dropped.most_common(12)
        ],
        "presented": [
            {
                "slide_id": k,
                "name": names.get(k, str(k)),
                "avg_seconds": round(sum(v) / len(v), 1),
                "times": len(v),
            }
            for k, v in sorted(presented_time.items())
        ],
        "suggestions": suggestions,
    }
