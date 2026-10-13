"""End-to-end snapshots of the presentation module, for the stage 0–8 refactor.

These are not unit tests and they do not explain themselves when they fail. That is the job: they
run the whole pipeline — collector, analytics, `deck_data`, generation, the edit layer, validation
— and assert that the .pptx coming out is byte-for-meaning the same one. A refactor that keeps
every unit test green and still moves a slide, drops a table row or changes a status colour fails
here, which is exactly the failure a nine-stage rewrite needs to be able to see.

Re-record on purpose with ``CADENCIA_UPDATE_GOLDEN=1 .venv/bin/pytest tests/test_golden.py``, and
read the diff before committing it.
"""

from __future__ import annotations

import asyncio
import os

import pytest

from cadencia.report.core.edits import (
    DeckEdits,
    Frame,
    ParagraphEdit,
    ShapeEdit,
    SlideEdits,
    TextEdit,
    slide_key,
)
from cadencia.report.core.mapping import Binding, DeckMapping
from cadencia.report.core.sample_template import build_sample_template
from cadencia.report.core.suggest import as_repeat, suggest_mapping
from cadencia.report.service import generate_report, save_edits, store_template
from cadencia.store import repo
from cadencia.store.db import session_scope
from tests.golden import compare, run_digest
from tests.support import NOW, collect_demo, process_locale

UPDATE = os.environ.get("CADENCIA_UPDATE_GOLDEN") == "1"


@pytest.fixture(autouse=True, params=["en-US", "de-DE"])
def _locale(request):
    """Every case runs under en-US and de-DE — as the request's language and as CADENCIA_LOCALE —
    against the same pt-BR snapshots: the deck is not translated (docs/i18n.md), so neither
    language may leak into it. pt-BR is left out on purpose; it would prove nothing."""
    with process_locale(request.param):
        yield request.param


@pytest.fixture
def seeded(demo, sessions, settings, tmp_path):
    """The demo instance collected into a real database, with the sample template mapped."""
    asyncio.run(collect_demo(demo, sessions, settings))
    path = build_sample_template(tmp_path / "modelo.pptx")
    with session_scope(sessions) as session:
        template = store_template(session, settings, "modelo.pptx", path.read_bytes(), "Modelo")
        template_id, sha, manifest = template.id, template.sha256, template.manifest
    return {
        "sessions": sessions,
        "settings": settings,
        "template_id": template_id,
        "sha256": sha,
        "manifest": manifest,
    }


def _mapped(seeded, mapping: DeckMapping) -> None:
    with session_scope(seeded["sessions"]) as session:
        repo.save_mapping(session, seeded["template_id"], seeded["sha256"], mapping.model_dump(mode="json"))


def _generate(seeded, name: str) -> None:
    with session_scope(seeded["sessions"]) as session:
        run = generate_report(
            session,
            seeded["settings"],
            seeded["template_id"],
            render=False,  # LibreOffice is not part of what is being pinned here
            now=NOW,
        )
        digest = run_digest(run.validation["produced"], run.validation, run.path)
    compare(name, digest, update=UPDATE)


def test_golden_marker_only_deck(seeded):
    """No mapping at all: only the ``{{markers}}`` written into the template are filled.

    This is the floor of the module — the path a template takes before anybody maps anything — and
    it exercises `expand_markers`, the registry and the validation report with nothing else in the
    way.
    """
    _generate(seeded, "marker_only")


def test_golden_repeat_per_board(seeded):
    """The ordinary case: every board gets its own copy of the repeated slides."""
    suggestion = as_repeat(suggest_mapping(seeded["manifest"], []))
    suggestion.pop("notes", None)
    _mapped(seeded, DeckMapping.model_validate(suggestion))
    _generate(seeded, "repeat_per_board")


def test_golden_repeat_per_space(seeded):
    """One slide per space instead of per board, which is a different audience and a different deck."""
    suggestion = as_repeat(suggest_mapping(seeded["manifest"], []))
    suggestion.pop("notes", None)
    mapping = DeckMapping.model_validate(suggestion)
    for spec in mapping.slides.values():
        if spec.scope == "repeat":
            spec.repeat_by = "espaco"
    _mapped(seeded, mapping)
    _generate(seeded, "repeat_per_space")


def test_golden_everything_at_once(seeded):
    """One deck exercising every surface the stage 1–8 refactor will move.

    Charts (a rendered picture), tables, a status fill, variables of all three kinds — hand-filled,
    defaulted, and read from a Jira field — literal markers, a slide scoped to one space, and a
    manual edit replayed on top. If a stage changes any of these, this snapshot is where it shows.

    ``objetivo`` reads from ``sprint.objetivo`` and one of the three demo boards has no sprint
    goal, so this also pins RF-59's rule that an empty *source* is an answer rather than a gap:
    that board's slide comes out blank with a ``vazio`` warning, not a refused deck. The variable
    RF-45 still refuses — one nobody wired and nobody typed — is covered in ``test_report.py``,
    where it can be asserted on directly.
    """
    sessions = seeded["sessions"]
    manifest = seeded["manifest"]
    slides = manifest["slides"]

    with session_scope(sessions) as session:
        # A variable somebody writes, one with a registration default, and one read from Jira.
        aviso = repo.create_variable(session, name="aviso", label="Aviso", at=NOW)
        repo.set_variable_value(session, aviso.id, scope="global", scope_key="", value="Interno.", at=NOW)
        repo.create_variable(session, name="nota", label="Nota", default="Sem nota.", at=NOW)
        repo.create_variable(
            session, name="objetivo", label="Objetivo", source_field="sprint.objetivo", at=NOW
        )

    suggestion = as_repeat(suggest_mapping(manifest, []))
    suggestion.pop("notes", None)
    mapping = DeckMapping.model_validate(suggestion)
    board_slide = str(slides[1]["slide_id"])
    areas = {a["name"]: a["id"] for a in slides[1]["areas"]}
    spec = mapping.slides[board_slide]
    spec.bindings += [
        Binding(target=areas["Gráfico vazão"], mode="chart", field="grafico.vazao"),
        Binding(target=areas["Área gráfico riscos"], mode="chart", field="grafico.riscos"),
        Binding(
            target=areas["TextBox 6"],
            mode="text",
            value="{{texto.aviso}} · {{texto.nota}} · {{texto.objetivo}}",
        ),
    ]
    # A second repeated slide that only one space receives (RF-55).
    mapping.slides[str(slides[2]["slide_id"])].only_spaces = ["CAD"]
    _mapped(seeded, mapping)

    # A manual edit replayed after the data is in (RF-46): moved, recoloured, retyped.
    key = slide_key(slides[1]["slide_id"], 1, 1)
    shape = f"sh{slides[1]['areas'][0]['shape_id']}"
    with session_scope(sessions) as session:
        save_edits(
            session,
            seeded["template_id"],
            DeckEdits(
                slides={
                    key: SlideEdits(
                        shapes={
                            shape: ShapeEdit(
                                frame=Frame(x=500000, y=400000),
                                text=TextEdit(paragraphs=[ParagraphEdit(text="Editado à mão")]),
                            )
                        },
                        notes="Nota do apresentador.",
                    )
                }
            ),
            NOW,
        )

    _generate(seeded, "everything_at_once")
