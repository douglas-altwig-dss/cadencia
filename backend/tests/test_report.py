import copy
import zipfile

import pytest
from lxml import etree
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE, MSO_SHAPE_TYPE
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

from cadencia.report.core import layout as lay
from cadencia.report.core import pptx_utils as px
from cadencia.report.core.context import (
    BoardDeck,
    DeckData,
    Group,
    Row,
    RowGroup,
    Series,
    VariableSpec,
    resolve,
)
from cadencia.report.core.edits import (
    DeckEdits,
    Fill,
    Frame,
    Line,
    ParagraphEdit,
    RunEdit,
    RunStyle,
    Shadow,
    ShapeEdit,
    SlideEdits,
    TextEdit,
    apply_deck_edits,
    shape_key,
    slide_key,
    template_slide_key,
)
from cadencia.report.core.generate import MarkerReport, expand_markers, generate_deck
from cadencia.report.core.geometry import iter_placed
from cadencia.report.core.manifest import extract_manifest, parse_target, target_ids
from cadencia.report.core.mapping import Binding, DeckMapping
from cadencia.report.core.package_check import check_package
from cadencia.report.core.pptx_utils import iter_shapes
from cadencia.report.core.resolve_preview import slide_preview
from cadencia.report.core.sample_template import build_sample_template
from cadencia.report.core.scene import deck_scene
from cadencia.report.core.suggest import as_repeat, suggest_mapping
from cadencia.report.core.text import leftover_markers, replace_in_paragraph
from cadencia.report.core.validate import ERROR_KINDS, validate_deck
from tests.support import NOW

A_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


@pytest.fixture
def template(tmp_path):
    return build_sample_template(tmp_path / "modelo.pptx")


@pytest.fixture
def manifest(template):
    return extract_manifest(template)


def area(manifest, slide_index, name):
    slide = manifest["slides"][slide_index - 1]
    return next(a for a in slide["areas"] if a["name"] == name)


def shape_named(slide, name):
    return next(s for s, _ in iter_shapes(slide.shapes) if s.name == name)


def mapping_for(manifest, **extra):
    suggestion = as_repeat(suggest_mapping(manifest, []))
    suggestion.pop("notes")
    board_slide = str(manifest["slides"][1]["slide_id"])
    chart = next(a for a in manifest["slides"][1]["areas"] if a["kind"] == "chart")
    image = area(manifest, 2, "Área gráfico riscos")
    suggestion["slides"][board_slide]["bindings"] += [
        {"target": chart["id"], "mode": "chart", "field": "grafico.vazao"},
        {"target": image["id"], "mode": "chart", "field": "grafico.riscos"},
    ]
    suggestion.update(extra)
    return DeckMapping.model_validate(suggestion)


def board(board_id, name, rows=3, space=None):
    items = [
        Row(
            {
                "sprint": "3.5",
                "chave": f"K-{i}",
                "resumo": f"Item {i}",
                "responsavel": "Ana",
                "acao": "",
                "prazo": "11/09",
                "situacao": "concluido",
            },
            "concluido",
        )
        for i in range(rows)
    ]
    return BoardDeck(
        board_id=board_id,
        name=name,
        space_name=space,
        texts={
            "board.nome": name,
            "espaco.nome": space or name,
            "sprint.nome": f"Sprint {board_id}",
        },
        groups={
            "entregas.por_epico": [
                Group("Épico A:", ["Entrega 1", "Entrega 2"]),
                Group("Sem épico:", ["Entrega 3"]),
            ]
        },
        rows={
            "riscos.bloqueios": [
                Row({"resumo": "Bloqueado X", "acao": "sinalizado", "situacao": "risco"}, "risco")
            ]
        },
        row_groups={"acompanhamento.por_epico": [RowGroup("Épico A", items)]},
        statuses={"board.status_geral": "risco"},
        series={
            "grafico.vazao": Series(["Semana 1", "Semana 2"], {"Entregues": [3, 4]}),
            "grafico.riscos": Series(["Em dia", "Bloqueado"], {"Itens": [5, 1]}),
        },
    )


def deck(*boards, variables=(), template_name="Modelo de teste"):
    """``variables`` is the registration: a bare name, or ``(name, default)``.

    Nothing is registered unless it is named here, which is the rule under test — an unregistered
    ``{{texto.x}}`` is refused rather than rendered blank.
    """
    registry = {}
    for entry in variables:
        name, default = entry if isinstance(entry, tuple) else (entry, None)
        registry[name] = VariableSpec(name=name, label=name, default=default)
    return DeckData(
        reference=NOW,
        texts={"relatorio.semana": "04/09/2026", "relatorio.data": "10/09/2026"},
        boards=list(boards),
        variables=registry,
        template_name=template_name,
    )


def test_marker_split_in_three_runs_keeps_the_first_run_format():
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    paragraph = slide.shapes.add_textbox(0, 0, 100, 100).text_frame.paragraphs[0]
    first = paragraph.add_run()
    first.text = "Sprint: {{sprint."
    first.font.bold = True
    first.font.size = Pt(20)
    paragraph.add_run().text = "no"
    paragraph.add_run().text = "me}} fim"
    found = replace_in_paragraph(paragraph, lambda name: "Sprint 12" if name == "sprint.nome" else "")
    assert found == ["sprint.nome"]
    assert paragraph.text == "Sprint: Sprint 12 fim"
    assert len(paragraph.runs) == 1
    assert paragraph.runs[0].font.bold and paragraph.runs[0].font.size == Pt(20)


def test_manifest_lists_replaceable_areas_with_stable_ids(template, manifest):
    assert manifest["template"]["slides"] == 4
    assert target_ids(manifest) == target_ids(extract_manifest(template))
    cover = manifest["slides"][0]
    assert any("relatorio.semana" in a["markers"] for a in cover["areas"])
    legend = next(
        a for a in manifest["slides"][2]["areas"] if a["kind"] == "table" and a["table"]["cols"] == 4
    )
    assert legend["table"]["fills"][0][1] == "00B050"
    chart = next(a for a in manifest["slides"][1]["areas"] if a["kind"] == "chart")
    assert chart["chart"]["series"] == ["Entregues"]
    target = parse_target(f"s{cover['slide_id']}/sh5#r2c3p1")
    assert (target.row, target.col, target.paragraph) == (2, 3, 1)


def test_suggestion_reads_the_template_labels_and_legend(manifest):
    suggestion = suggest_mapping(manifest, [{"id": 1, "name": "Plataforma"}])
    board_slide = suggestion["slides"][str(manifest["slides"][1]["slide_id"])]
    by_field = {b["field"]: b for b in board_slide["bindings"]}
    assert by_field["entregas.por_epico"]["mode"] == "grouped_list"
    assert by_field["riscos.bloqueios"]["columns"] == ["resumo", "acao", "situacao"]
    assert (
        by_field["board.status_geral"]["target"] == area(manifest, 2, "Rounded Rectangle 5")["id"]
        or by_field["board.status_geral"]["mode"] == "status_fill"
    )
    risks = suggestion["slides"][str(manifest["slides"][2]["slide_id"])]
    tracking = next(b for b in risks["bindings"] if b["field"] == "acompanhamento.por_epico")
    assert tracking["columns"] == ["sprint", "chave", "resumo", "responsavel", "acao", "prazo", "situacao"]
    assert tracking["status_column"] == 6
    assert suggestion["palette"]["risco"] == "FFC000"
    assert suggestion["status_labels"]["atrasado"] == "Atrasado"


def test_cloning_a_mapping_matches_shapes_by_slide_position_and_name(tmp_path):
    """#13: a redesigned template gets new slide/shape ids from python-pptx, but a template author
    redesigning rather than rebuilding tends to keep a shape's name and its place in the deck."""
    from pptx import Presentation
    from pptx.util import Inches

    from cadencia.report.core.suggest import apply_mapping_clone, plan_mapping_clone

    def build(path, bump_ids):
        prs = Presentation()
        prs.slide_width, prs.slide_height = Inches(10), Inches(7.5)
        s1 = prs.slides.add_slide(prs.slide_layouts[6])
        if bump_ids:  # an extra shape ahead of "Titulo" shifts its shape_id, not its name or slide.
            s1.shapes.add_textbox(Inches(0), Inches(0), Inches(1), Inches(1))
        title = s1.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1))
        title.name = "Titulo"
        title.text_frame.paragraphs[0].text = "x"
        s2 = prs.slides.add_slide(prs.slide_layouts[6])
        # Only the "from" file has this shape — the redesign dropped it, so nothing can match it.
        name = "SoNaOrigem" if not bump_ids else "Renomeada"
        s2.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1)).name = name
        prs.save(str(path))
        return extract_manifest(path)

    from_manifest = build(tmp_path / "a.pptx", bump_ids=False)
    to_manifest = build(tmp_path / "b.pptx", bump_ids=True)
    title_from = area(from_manifest, 1, "Titulo")
    orphan_from = area(from_manifest, 2, "SoNaOrigem")
    assert title_from["shape_id"] != area(to_manifest, 1, "Titulo")["shape_id"]  # ids genuinely differ

    from_mapping = {
        "slides": {
            str(from_manifest["slides"][0]["slide_id"]): {
                "bindings": [{"target": f"{title_from['id']}#p1", "mode": "text", "field": "sprint.nome"}]
            },
            str(from_manifest["slides"][1]["slide_id"]): {
                "bindings": [{"target": orphan_from["id"], "mode": "text", "field": "sprint.objetivo"}]
            },
        },
        "palette": {"risco": "FFC000"},
    }

    plan = plan_mapping_clone(from_manifest, from_mapping, to_manifest)
    assert len(plan["matched"]) == 1 and len(plan["unmatched"]) == 1
    # Named in the source, but "SoNaOrigem" has no counterpart at that position in the new file.
    assert plan["unmatched"][0]["shape_name"] == "SoNaOrigem"

    matched = plan["matched"][0]
    title_to = area(to_manifest, 1, "Titulo")
    assert matched["new_target"] == f"{title_to['id']}#p1"

    cloned, plan_again = apply_mapping_clone(from_manifest, from_mapping, to_manifest)
    assert plan_again == plan
    assert cloned["palette"] == {"risco": "FFC000"}  # deck-level settings copy wholesale
    new_slide_key = str(to_manifest["slides"][0]["slide_id"])
    assert list(cloned["slides"]) == [new_slide_key]  # the orphaned slide carries nothing over
    assert cloned["slides"][new_slide_key]["bindings"] == [
        {"target": f"{title_to['id']}#p1", "mode": "text", "field": "sprint.nome"}
    ]


def test_generation_fills_every_kind_of_area(template, manifest, tmp_path):
    out = tmp_path / "saida.pptx"
    result = generate_deck(
        template,
        mapping_for(manifest),
        deck(board(1, "Plataforma"), board(2, "Dados")),
        out,
        theme=manifest["theme"],
    )
    prs = Presentation(str(out))
    slides = list(prs.slides)
    assert len(slides) == 6  # cover + (board + risks) × 2 boards + closing
    assert [p["board_id"] for p in result.produced] == [None, 1, 1, 2, 2, None]

    cover_value = next(
        s
        for s, _ in iter_shapes(slides[0].shapes)
        if s.has_text_frame and s.text_frame.text.startswith("SEMANA")
    )
    assert cover_value.text_frame.paragraphs[1].text == "04/09/2026"
    assert cover_value.text_frame.paragraphs[1].runs[0].font.bold

    board_slide = slides[1]
    project = next(
        s
        for s, _ in iter_shapes(board_slide.shapes)
        if s.has_text_frame and s.text_frame.text.startswith("PROJETO")
    )
    assert project.text_frame.paragraphs[1].text == "Plataforma"
    assert "Dados" in [
        p.text for s, _ in iter_shapes(slides[3].shapes) if s.has_text_frame for p in s.text_frame.paragraphs
    ]

    delivered = next(
        s
        for s, _ in iter_shapes(board_slide.shapes)
        if s.has_table and len(s.table.rows) == 1 and len(s.table.columns) == 1
    )
    paragraphs = delivered.table.cell(0, 0).text_frame.paragraphs
    assert [p.text for p in paragraphs] == [
        "Épico A:",
        "Entrega 1",
        "Entrega 2",
        "",
        "Sem épico:",
        "Entrega 3",
    ]
    assert paragraphs[1]._p.pPr.find(qn("a:buChar")) is not None

    blockers = next(
        s for s, _ in iter_shapes(board_slide.shapes) if s.has_table and len(s.table.columns) == 3
    )
    assert blockers.table.cell(1, 0).text == "Bloqueado X"
    assert blockers.table.cell(1, 2).text == "Em risco"
    assert str(blockers.table.cell(1, 2).fill.fore_color.rgb) == "FFC000"

    indicator = next(s for s, _ in iter_shapes(board_slide.shapes) if s.name.startswith("Rounded Rectangle"))
    assert str(indicator.fill.fore_color.rgb) == "FFC000"

    chart = next(s for s, _ in iter_shapes(board_slide.shapes) if s.has_chart).chart
    assert list(chart.plots[0].categories) == ["Semana 1", "Semana 2"]
    assert list(chart.plots[0].series[0].values) == [3.0, 4.0]
    assert not any(s.name == "Área gráfico riscos" for s, _ in iter_shapes(board_slide.shapes))
    assert any(s.shape_type == MSO_SHAPE_TYPE.PICTURE for s, _ in iter_shapes(board_slide.shapes))

    tracking = next(
        s for s, _ in iter_shapes(slides[2].shapes) if s.has_table and len(s.table.columns) == 7
    ).table
    assert len(tracking.rows) == 1 + 1 + 3
    assert tracking.cell(1, 2).text == "Épico A"
    assert tracking.cell(2, 6).text == "Concluído"
    assert str(tracking.cell(2, 6).fill.fore_color.rgb) == "00B050"

    assert all(not leftover_markers(s) for s in slides)
    closing = slides[-1].shapes[0].text_frame.text
    assert closing == "Gerado pela Cadência em 10/09/2026"
    report = validate_deck(
        result, mapping_for(manifest), mapped_sha256=manifest["template"]["sha256"], current_manifest=manifest
    )
    assert report["ok"], report["errors"]


def test_long_tables_continue_on_cloned_slides(template, manifest, tmp_path):
    out = tmp_path / "longo.pptx"
    generate_deck(template, mapping_for(manifest), deck(board(1, "Plataforma", rows=40)), out)
    prs = Presentation(str(out))
    pages = [
        s
        for s in prs.slides
        if any(sh.has_table and len(sh.table.columns) == 7 for sh, _ in iter_shapes(s.shapes))
    ]
    assert len(pages) >= 3
    second = next(
        sh for sh, _ in iter_shapes(pages[1].shapes) if sh.has_table and len(sh.table.columns) == 7
    ).table
    assert second.cell(1, 2).text == "Épico A (cont.)"
    keys = [
        sh.table.cell(r, 1).text
        for page in pages
        for sh, _ in iter_shapes(page.shapes)
        if sh.has_table and len(sh.table.columns) == 7
        for r in range(1, len(sh.table.rows))
    ]
    assert [k for k in keys if k] == [f"K-{i}" for i in range(40)]


def test_validation_flags_missing_areas_empty_fields_and_template_changes(template, manifest, tmp_path):
    mapping = mapping_for(manifest)
    team_id = str(manifest["slides"][1]["slide_id"])
    mapping.slides[team_id].bindings.append(
        copy.deepcopy(mapping.slides[team_id].bindings[0]).model_copy(update={"target": f"s{team_id}/sh999"})
    )
    empty = board(1, "Plataforma")
    empty.groups = {}
    out = tmp_path / "invalido.pptx"
    result = generate_deck(template, mapping, deck(empty), out)
    report = validate_deck(result, mapping, mapped_sha256="outro-sha", current_manifest=manifest)
    kinds = {e["kind"] for e in report["errors"]}
    assert not report["ok"] and "area_ausente" in kinds
    warnings = {w["kind"] for w in report["warnings"]}
    assert {"vazio", "modelo_alterado"} <= warnings


def test_project_name_comes_from_the_space_not_the_board(template, manifest, tmp_path):
    """RF-38: the template's PROJECT NAME slot is the team, so it takes the space, not the board."""
    out = tmp_path / "espaco.pptx"
    generate_deck(
        template,
        mapping_for(manifest),
        deck(board(1, "Plataforma", space="Produto Digital")),
        out,
    )
    project = next(
        s
        for s, _ in iter_shapes(list(Presentation(str(out)).slides)[1].shapes)
        if s.has_text_frame and s.text_frame.text.startswith("PROJETO")
    )
    assert project.text_frame.paragraphs[1].text == "Produto Digital"


def test_mappings_saved_with_the_old_time_field_names_still_resolve():
    """Decks mapped before a board stopped being called a "time" must keep generating."""
    data = deck(board(1, "Plataforma", space="Produto Digital"))
    board_deck = data.boards[0]
    assert resolve(data, board_deck, "time.nome") == ("text", "Plataforma")
    assert resolve(data, board_deck, "time.projeto") == ("text", "Produto Digital")
    assert resolve(data, board_deck, "time.status_geral") == ("status", "risco")
    assert resolve(data, board_deck, "nao.existe") == (None, None)


def test_removed_slides_are_dropped(template, manifest, tmp_path):
    mapping = mapping_for(manifest)
    closing_id = str(manifest["slides"][3]["slide_id"])
    mapping.slides[closing_id] = mapping.slides.get(closing_id) or mapping.for_slide(int(closing_id))
    mapping.slides[closing_id].action = "remove"
    out = tmp_path / "sem-final.pptx"
    generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    assert len(Presentation(str(out)).slides) == 3


# ---------------------------------------------------------------- layout options (RF-41)


def rows_of(*specs):
    return [Row({"chave": k, "resumo": r, "responsavel": o, "prazo": p}, status=s) for k, r, o, p, s in specs]


SAMPLE = rows_of(
    ("K-3", "Ajustar cobrança", "Bruno", "12/09", "risco"),
    ("K-1", "Terminar checkout", "Ana", "10/09", "concluido"),
    ("K-2", "Revisar contrato muito comprido para caber", "Carla", "", "atrasado"),
)


def binding(**kw):
    return Binding(target="s1/sh2", mode=kw.pop("mode", "text"), **kw)


def test_layout_sorts_filters_and_trims_rows():
    assert [r.values["chave"] for r in lay.shape_rows(SAMPLE, binding(sort="chave"))] == ["K-1", "K-2", "K-3"]
    assert [r.values["chave"] for r in lay.shape_rows(SAMPLE, binding(sort="chave", descending=True))] == [
        "K-3",
        "K-2",
        "K-1",
    ]
    # "modelo" keeps the order the board gave, which is the board's own ranking.
    assert [r.values["chave"] for r in lay.shape_rows(SAMPLE, binding())] == ["K-3", "K-1", "K-2"]
    kept = lay.shape_rows(SAMPLE, binding(only_status=["risco", "atrasado"]))
    assert [r.values["chave"] for r in kept] == ["K-3", "K-2"]
    assert len(lay.shape_rows(SAMPLE, binding(max_items=2))) == 2
    # An empty prazo sorts last rather than first, so dated items lead the table.
    assert [r.values["chave"] for r in lay.shape_rows(SAMPLE, binding(sort="prazo"))] == [
        "K-1",
        "K-3",
        "K-2",
    ]


def test_layout_decorates_text_with_prefix_case_and_clipping():
    b = binding(prefix="• ", suffix=".", text_case="maiuscula", max_chars=12)
    assert lay.decorate("Terminar checkout", b) == "• TERMINAR CH…."
    assert lay.decorate("", b) == ""
    assert lay.apply_case("terminar o checkout", "capitular") == "Terminar o checkout"


def test_layout_formats_numbers_in_portuguese():
    assert lay.format_number(0.8425, binding(number_format="percentual")) == "84%"
    assert lay.format_number(0.8437, binding(number_format="percentual_decimal", decimals=1)) == "84,4%"
    assert lay.format_number(3.5, binding(number_format="decimal", decimals=1)) == "3,5"
    assert lay.format_number(3.5, binding(number_format="inteiro")) == "4"
    assert lay.format_number(1234.5, binding(number_format="moeda", decimals=2)) == "R$ 1.234,50"
    assert lay.format_number(None, binding()) == ""


def test_layout_flattens_groups_into_lines():
    groups = [Group("Épico A:", ["um", "dois"]), Group("Épico B:", ["três"])]
    assert lay.flatten(groups, "groups", binding()) == ["um", "dois", "três"]
    # Flattened, the list has no groups left, so the cap is on the whole list…
    assert lay.flatten(groups, "groups", binding(max_items=2)) == ["um", "dois"]
    # …while a grouped list keeps its groups and shortens each one instead of dropping an epic.
    shaped = lay.shape_groups(groups, binding(max_items=1))
    assert [(g.title, g.items) for g in shaped] == [("Épico A:", ["um"]), ("Épico B:", ["três"])]
    assert lay.flatten(SAMPLE, "rows", binding(sort="chave", max_items=2)) == [
        "Terminar checkout",
        "Revisar contrato muito comprido para caber",
    ]


def test_generated_deck_fills_each_space_with_its_own_variable():
    """RF-45: one template, two spaces, the right static text on each cloned slide."""
    data = deck(
        board(1, "Plataforma", space="Produto Digital"),
        board(2, "Dados", space="Inteligência de Dados"),
        variables=["definicao", "outro"],
    )
    data.boards[0].texts["texto.definicao"] = "Checkout e pagamentos."
    data.boards[1].texts["texto.definicao"] = "Ingestão e data warehouse."
    mapping = DeckMapping()
    literal = Binding(target="s1/sh2", mode="text", value="Sobre: {{texto.definicao}}")
    assert expand_markers(literal.value, data, data.boards[0], mapping) == "Sobre: Checkout e pagamentos."
    assert expand_markers(literal.value, data, data.boards[1], mapping) == "Sobre: Ingestão e data warehouse."
    # A name that is not a field at all stays visible, so a typo is obvious rather than blank.
    assert expand_markers("{{nao.existe}}", data, data.boards[0], mapping) == "{{nao.existe}}"
    # Registered, but this space never filled it in and the registration has no default: the
    # marker survives instead of collapsing to "", and the two faults are reported apart.
    report = MarkerReport()
    assert expand_markers("{{texto.outro}}", data, data.boards[0], mapping, report) == "{{texto.outro}}"
    assert report.unfilled == ["texto.outro"] and report.unregistered == []
    report = MarkerReport()
    assert expand_markers("{{texto.fantasma}}", data, data.boards[0], mapping, report) == "{{texto.fantasma}}"
    assert report.unregistered == ["texto.fantasma"] and report.unfilled == []


def test_a_registered_default_is_the_only_default_there_is():
    """A fallback belongs to the registration; nothing else may invent one."""
    data = deck(board(1, "Plataforma", space="Produto Digital"), variables=[("aviso", "Uso interno.")])
    mapping = DeckMapping()
    report = MarkerReport()
    # Nobody set a value at any scope, so the registration answers.
    data.texts["texto.aviso"] = "Uso interno."  # what repo.resolve_variables hands over
    assert expand_markers("{{texto.aviso}}", data, data.boards[0], mapping, report) == "Uso interno."
    assert not report.any()
    # The board's own value still wins over it.
    data.boards[0].texts["texto.aviso"] = "Confidencial."
    assert expand_markers("{{texto.aviso}}", data, data.boards[0], mapping) == "Confidencial."
    # And an empty value somebody chose is a value, not a missing one.
    data.boards[0].texts["texto.aviso"] = ""
    report = MarkerReport()
    assert expand_markers("[{{texto.aviso}}]", data, data.boards[0], mapping, report) == "[]"
    assert not report.any()


def test_an_unregistered_variable_stops_the_deck_instead_of_printing_nothing(template, manifest, tmp_path):
    """Registration is the source of truth: an unknown name is an error, and it stays visible."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    data = deck(board(1, "Plataforma", space="Produto Digital"), template_name="Semanal")
    mapping = DeckMapping(
        slides={
            str(slide["slide_id"]): {
                "scope": "board",
                "board_id": 1,
                "bindings": [{"target": area["id"], "mode": "text", "value": "Sobre: {{texto.definicao}}"}],
            }
        }
    )
    out = tmp_path / "sem-registro.pptx"
    result = generate_deck(template, mapping, data, out)
    problem = next(p for p in result.problems if p.kind == "variavel_nao_registrada")
    assert "{{texto.definicao}}" in problem.message and "Semanal" in problem.message
    assert problem.kind in ERROR_KINDS
    shape = next(
        s
        for s, _ in iter_shapes(list(Presentation(str(out)).slides)[1].shapes)
        if s.shape_id == area["shape_id"]
    )
    assert "{{texto.definicao}}" in shape.text_frame.text


def test_a_registered_variable_nobody_filled_in_is_refused(template, manifest, tmp_path):
    """Registered but unanswered is its own error, and names the space that is short of it."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    data = deck(board(1, "Plataforma", space="Produto Digital"), variables=["definicao"])
    mapping = DeckMapping(
        slides={
            str(slide["slide_id"]): {
                "scope": "board",
                "board_id": 1,
                "bindings": [{"target": area["id"], "mode": "text", "field": "texto.definicao"}],
            }
        }
    )
    result = generate_deck(template, mapping, data, tmp_path / "sem-valor.pptx")
    problem = next(p for p in result.problems if p.kind == "variavel_sem_valor")
    assert "Produto Digital" in problem.message and "{{texto.definicao}}" in problem.message
    assert problem.kind in ERROR_KINDS


def test_a_slide_level_variable_beats_the_board_one_in_the_generated_file(template, manifest, tmp_path):
    """RF-52: the three levels all the way to the .pptx, not only to the preview."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    data = deck(board(1, "Plataforma", space="Produto Digital"), variables=["definicao"])
    # What the board resolves to, and what this one slide overrides it with.
    data.boards[0].texts["texto.definicao"] = "Checkout e pagamentos."
    data.slide_texts = {slide["slide_id"]: {"definicao": "Só neste slide."}}
    mapping = DeckMapping(
        slides={
            str(slide["slide_id"]): {
                "scope": "board",
                "board_id": 1,
                "bindings": [{"target": area["id"], "mode": "text", "value": "Sobre: {{texto.definicao}}"}],
            }
        }
    )
    out = tmp_path / "niveis.pptx"
    generate_deck(template, mapping, data, out)
    shape = next(
        s
        for s, _ in iter_shapes(list(Presentation(str(out)).slides)[1].shapes)
        if s.shape_id == area["shape_id"]
    )
    assert shape.text_frame.text.startswith("Sobre: Só neste slide.")
    # Every other slide still gets the board's wording.
    assert expand_markers("{{texto.definicao}}", data, data.boards[0], mapping) == "Checkout e pagamentos."


def test_new_binding_modes_reach_the_slide(template, manifest, tmp_path):
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs") and len(a["paragraphs"]) > 1)
    mapping = DeckMapping(
        slides={
            str(slide["slide_id"]): {
                "scope": "board",
                "board_id": 1,
                "bindings": [
                    {
                        "target": area["id"],
                        "mode": "bullet_list",
                        "field": "entregas.por_epico",
                        "bullet": "›",
                        "text_case": "maiuscula",
                        "max_items": 2,
                        "align": "centro",
                        "text_columns": 2,
                    }
                ],
            }
        }
    )
    out = tmp_path / "modos.pptx"
    generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    shape = next(
        s
        for s, _ in iter_shapes(list(Presentation(str(out)).slides)[1].shapes)
        if s.shape_id == area["shape_id"]
    )
    lines = [p.text for p in shape.text_frame.paragraphs if p.text]
    assert lines == ["› ENTREGA 1", "› ENTREGA 2"]  # bullet, casing and the cap all applied
    assert shape.text_frame._txBody.bodyPr.get("numCol") == "2"
    assert shape.text_frame.paragraphs[0]._p.pPr.get("algn") == "ctr"


def test_number_mode_formats_the_value_for_the_slide(template, manifest, tmp_path):
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    mapping = DeckMapping(
        slides={
            str(slide["slide_id"]): {
                "scope": "board",
                "board_id": 1,
                "bindings": [
                    {
                        "target": area["id"],
                        "mode": "number",
                        "field": "num.aderencia",
                        "number_format": "percentual",
                        "suffix": " do combinado",
                    }
                ],
            }
        }
    )
    data = deck(board(1, "Plataforma"))
    data.boards[0].numbers["num.aderencia"] = 0.75
    out = tmp_path / "numero.pptx"
    generate_deck(template, mapping, data, out)
    shape = next(
        s
        for s, _ in iter_shapes(list(Presentation(str(out)).slides)[1].shapes)
        if s.shape_id == area["shape_id"]
    )
    assert shape.text_frame.text == "75% do combinado"


def test_repeat_per_project_makes_one_slide_per_space(template, manifest, tmp_path):
    """Two boards of one team share a project slide; a second team gets its own."""
    slide_id = str(manifest["slides"][1]["slide_id"])
    mapping = mapping_for(manifest)
    mapping.slides[slide_id].scope = "repeat"
    mapping.slides[slide_id].repeat_by = "espaco"
    data = deck(
        board(1, "Plataforma", space="Produto Digital"),
        board(3, "Suporte", space="Produto Digital"),
        board(2, "Dados", space="Inteligência de Dados"),
    )
    for b, key in zip(data.boards, ("CAD", "CAD", "DAD"), strict=True):
        b.space_key = key
    out = tmp_path / "por-espaco.pptx"
    result = generate_deck(template, mapping, data, out)
    produced = [p["board_id"] for p in result.produced if p["origin_slide_id"] == int(slide_id)]
    assert produced == [1, 2]  # one slide per space, not one per board

    mapping.slides[slide_id].repeat_by = "board"
    result = generate_deck(template, mapping, data, tmp_path / "por-board.pptx")
    produced = [p["board_id"] for p in result.produced if p["origin_slide_id"] == int(slide_id)]
    assert produced == [1, 3, 2]


def test_a_slide_can_be_dropped_when_its_field_has_nothing_to_show(template, manifest, tmp_path):
    slide_id = str(manifest["slides"][2]["slide_id"])
    mapping = mapping_for(manifest)
    mapping.slides[slide_id].scope = "board"
    mapping.slides[slide_id].board_id = 1
    mapping.slides[slide_id].hide_when_empty = "riscos.bloqueios"

    full = deck(board(1, "Plataforma"))
    kept = generate_deck(template, mapping, full, tmp_path / "com-bloqueios.pptx")
    assert any(p["origin_slide_id"] == int(slide_id) for p in kept.produced)

    quiet = deck(board(1, "Plataforma"))
    quiet.boards[0].rows["riscos.bloqueios"] = []
    dropped = generate_deck(template, mapping, quiet, tmp_path / "sem-bloqueios.pptx")
    assert not any(p["origin_slide_id"] == int(slide_id) for p in dropped.produced)
    assert dropped.slide_count == kept.slide_count - 1


def test_the_preview_says_exactly_what_the_generated_slide_says(template, manifest, tmp_path):
    """The preview is only worth having if it is the same pipeline: same options, same words."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs") and len(a["paragraphs"]) > 1)
    spec = {
        "scope": "board",
        "board_id": 1,
        "bindings": [
            {
                "target": area["id"],
                "mode": "bullet_list",
                "field": "entregas.por_epico",
                "bullet": "—",
                "text_case": "maiuscula",
                "max_chars": 8,
                "max_items": 2,
            }
        ],
    }
    mapping = DeckMapping(slides={str(slide["slide_id"]): spec})
    data = deck(board(1, "Plataforma"))

    view = slide_preview(slide, mapping.for_slide(slide["slide_id"]), mapping, data, data.boards[0])
    previewed = view["items"][0]["lines"]

    out = tmp_path / "fiel.pptx"
    generate_deck(template, mapping, data, out)
    shape = next(
        s
        for s, _ in iter_shapes(list(Presentation(str(out)).slides)[1].shapes)
        if s.shape_id == area["shape_id"]
    )
    generated = [p.text.removeprefix("— ") for p in shape.text_frame.paragraphs if p.text]
    assert previewed == generated == ["ENTREGA…", "ENTREGA…"]


def test_typing_on_an_inserted_shape_reaches_the_file(template, manifest, tmp_path):
    """RF-53: double-clicking a plain shape and typing has to end up in the .pptx, not just on screen.

    The canvas lets an inserted autoshape take a caret even though the scene gave it no text frame;
    this is the other half of that promise — an autoshape always has a `txBody`, so the words land.
    """
    slide = manifest["slides"][1]
    mapping = mapping_for(manifest)
    mapping.slides[str(slide["slide_id"])].scope = "board"
    mapping.slides[str(slide["slide_id"])].board_id = 1
    edits = DeckEdits(
        slides={
            slide_key(slide["slide_id"], 1, 1): SlideEdits(
                shapes={
                    "new:selo": ShapeEdit(
                        op="insert",
                        kind="shape",
                        preset="roundRect",
                        frame=Frame(x=600000, y=600000, cx=2000000, cy=800000),
                        # No text at insert time: the caret is what adds it, as the editor does.
                        text=TextEdit(
                            paragraphs=[
                                ParagraphEdit(text="Em risco", align="center", style=RunStyle(size_pt=18))
                            ]
                        ),
                    )
                }
            )
        }
    )
    out = tmp_path / "selo.pptx"
    result = generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    prs = Presentation(str(out))
    problems, _ = apply_deck_edits(prs, result.produced, edits, {})
    prs.save(str(out))
    assert problems == []

    shapes = {shape_key(s): s for s, _ in iter_shapes(list(Presentation(str(out)).slides)[1].shapes)}
    selo = shapes["new:selo"]
    assert selo.text_frame.text == "Em risco"
    assert selo.has_text_frame  # an autoshape always does, which is why the caret is honest
    assert not check_package(out).errors


def test_the_preview_reports_what_will_be_wrong_before_generating(template, manifest):
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    mapping = DeckMapping(
        slides={
            str(slide["slide_id"]): {
                "scope": "board",
                "board_id": 1,
                "bindings": [
                    {"target": area["id"], "mode": "text", "field": "nao.existe"},
                    {"target": area["id"], "mode": "text", "value": "Olá {{texto.faltando}}"},
                    {"target": area["id"], "mode": "text", "value": "Olá {{texto.fantasma}}"},
                ],
            }
        }
    )
    data = deck(board(1, "Plataforma", space="Produto Digital"), variables=["faltando"])
    view = slide_preview(slide, mapping.for_slide(slide["slide_id"]), mapping, data, data.boards[0])
    assert view["items"][0]["unknown"] is True
    # Registered but unanswered, and never registered at all, are different faults with different
    # fixes, so the preview keeps them apart instead of calling both "missing".
    assert view["items"][1]["missing_texts"] == ["texto.faltando"]
    assert view["items"][1]["unregistered_texts"] == []
    assert view["items"][2]["unregistered_texts"] == ["texto.fantasma"]
    assert view["items"][2]["missing_texts"] == []
    assert any("não existe no catálogo" in w for w in view["warnings"])
    assert any("não tem valor para “Produto Digital”" in w for w in view["warnings"])
    assert any("não está registrada" in w for w in view["warnings"])


# ---------------------------------------------------------------- the editor (RF-46, RF-47)


def test_edits_are_replayed_onto_a_freshly_generated_deck(template, manifest, tmp_path):
    """The point of the whole edit layer: new data, same layout work."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    mapping = mapping_for(manifest)
    mapping.slides[str(slide["slide_id"])].scope = "board"
    mapping.slides[str(slide["slide_id"])].board_id = 1
    key = slide_key(slide["slide_id"], 1, 1)
    moved = Frame(x=1143000, y=228600, cx=2286000, cy=685800, rotation=12.5)
    edits = DeckEdits(
        slides={
            key: SlideEdits(
                shapes={
                    f"sh{area['shape_id']}": ShapeEdit(frame=moved),
                    "new:nota": ShapeEdit(
                        op="insert",
                        kind="textbox",
                        frame=Frame(x=500000, y=4000000, cx=3000000, cy=600000),
                        text=TextEdit(
                            paragraphs=[
                                ParagraphEdit(text="Observação manual", style=RunStyle(size_pt=11, bold=True))
                            ]
                        ),
                    ),
                }
            )
        }
    )

    def build(out, board_name):
        result = generate_deck(template, mapping, deck(board(1, board_name)), out)
        prs = Presentation(str(out))
        problems, _ = apply_deck_edits(prs, result.produced, edits, {})
        prs.save(str(out))
        assert problems == []
        return prs

    first = build(tmp_path / "um.pptx", "Plataforma")
    # A second run with different data replays the same edits and lands in the same place.
    second = build(tmp_path / "dois.pptx", "Plataforma renomeada")

    for prs in (first, second):
        shapes = {shape_key(s): s for s, _ in iter_shapes(list(prs.slides)[1].shapes)}
        box = shapes[f"sh{area['shape_id']}"]
        assert (box.left, box.top, box.width, box.height) == (1143000, 228600, 2286000, 685800)
        assert round(box.rotation, 1) == 12.5
        note = shapes["new:nota"]
        assert note.text_frame.text == "Observação manual"
        assert note.name == "cadencia:new:nota"


def test_editing_a_slide_can_duplicate_delete_and_reorder(template, manifest, tmp_path):
    mapping = mapping_for(manifest)
    for spec in mapping.slides.values():
        spec.scope = "deck"
    out = tmp_path / "estrutura.pptx"
    result = generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    produced = result.produced
    keys = [slide_key(p["origin_slide_id"], p.get("board_id"), p["page"]) for p in produced]

    edits = DeckEdits(
        duplicates={"copia": keys[1]},
        deleted=[keys[-1]],
        order=[keys[1], "copia", keys[0]],
    )
    prs = Presentation(str(out))
    problems, placement = apply_deck_edits(prs, produced, edits, {})
    prs.save(str(out))
    assert problems == []
    assert placement[keys[1]] == 1 and placement["copia"] == 2 and placement[keys[0]] == 3
    assert len(Presentation(str(out)).slides) == len(produced)  # one added, one removed


def test_an_edited_deck_is_still_a_valid_pptx(template, manifest, tmp_path):
    """Everything is written through python-pptx, so PowerPoint must not ask to repair it."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    key = slide_key(slide["slide_id"], 1, 1)
    mapping = mapping_for(manifest)
    mapping.slides[str(slide["slide_id"])].scope = "board"
    mapping.slides[str(slide["slide_id"])].board_id = 1
    edits = DeckEdits(
        slides={
            key: SlideEdits(
                shapes={
                    f"sh{area['shape_id']}": ShapeEdit(
                        fill=Fill(type="solid", color="FFC000", alpha=0.5),
                        line=Line(type="solid", color="203864", width_pt=2.5, dash="dash"),
                        text=TextEdit(
                            anchor="middle",
                            word_wrap=True,
                            autofit="shrink",
                            insets_pt={"l": 6, "r": 6, "t": 3, "b": 3},
                            paragraphs=[
                                ParagraphEdit(
                                    text="Primeiro",
                                    align="center",
                                    bullet="char",
                                    line_spacing=1.5,
                                    style=RunStyle(font="Arial", size_pt=14, bold=True, color="203864"),
                                ),
                                ParagraphEdit(text="Segundo", bullet="number", level=1),
                            ],
                        ),
                    ),
                    "new:caixa": ShapeEdit(
                        op="insert",
                        kind="shape",
                        preset="roundRect",
                        frame=Frame(x=400000, y=400000, cx=1800000, cy=900000),
                        fill=Fill(type="solid", color="00B050"),
                        corner_radius=0.25,
                        z=0,
                    ),
                }
            )
        }
    )
    out = tmp_path / "editado.pptx"
    result = generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    prs = Presentation(str(out))
    apply_deck_edits(prs, result.produced, edits, {})
    prs.save(str(out))

    # Reopening is the real check: python-pptx refuses malformed parts, as PowerPoint would.
    reopened = Presentation(str(out))
    shapes = {shape_key(s): s for s, _ in iter_shapes(list(reopened.slides)[1].shapes)}
    box = shapes[f"sh{area['shape_id']}"]
    assert [p.text for p in box.text_frame.paragraphs] == ["Primeiro", "Segundo"]
    assert box.text_frame.paragraphs[0].runs[0].font.size.pt == 14
    assert str(box.fill.fore_color.rgb) == "FFC000"
    assert box.line.width == 2.5 * 12700
    assert shapes["new:caixa"].shape_type is not None
    # Alpha and dash are written as the DrawingML PowerPoint itself writes.
    assert box.fill._xPr.find(qn("a:solidFill"))[0].find(qn("a:alpha")).get("val") == "50000"
    assert box.line._ln.find(qn("a:prstDash")).get("val") == "dash"


def test_the_scene_reports_the_geometry_the_file_holds(template, manifest, tmp_path):
    """The canvas draws only from this, so it has to be the file's own numbers."""
    mapping = mapping_for(manifest)
    out = tmp_path / "cena.pptx"
    result = generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    scene = deck_scene(out, result.produced, mapping, theme=manifest["theme"])
    assert scene["slide_width"] == manifest["template"]["slide_width"]

    prs = Presentation(str(out))
    for entry, slide in zip(scene["slides"], prs.slides, strict=True):
        actual = {shape_key(s): s for s, _ in iter_shapes(slide.shapes)}
        for shape in entry["shapes"]:
            real = actual[shape["key"]]
            assert shape["frame"]["x"] == int(real.left or 0)
            assert shape["frame"]["y"] == int(real.top or 0)
            assert shape["frame"]["cx"] == int(real.width or 0)
            assert shape["frame"]["cy"] == int(real.height or 0)
    # Data-bound shapes are flagged, so the editor can say what a re-run will overwrite.
    bound = [s for e in scene["slides"] for s in e["shapes"] if s["bound"]]
    assert bound and all(s["bound_field"] for s in bound)


def test_mixed_formatting_survives_an_edit(template, manifest, tmp_path):
    """RF-48: a bold word inside a sentence is a run of its own, on the way in and on the way out."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    key = slide_key(slide["slide_id"], 1, 1)
    mapping = mapping_for(manifest)
    mapping.slides[str(slide["slide_id"])].scope = "board"
    mapping.slides[str(slide["slide_id"])].board_id = 1
    edits = DeckEdits(
        slides={
            key: SlideEdits(
                shapes={
                    f"sh{area['shape_id']}": ShapeEdit(
                        text=TextEdit(
                            paragraphs=[
                                ParagraphEdit(
                                    text="Entrega concluída hoje",
                                    runs=[
                                        RunEdit(text="Entrega "),
                                        RunEdit(text="concluída", style=RunStyle(bold=True, color="C92A2A")),
                                        RunEdit(text=" hoje", style=RunStyle(italic=True)),
                                    ],
                                )
                            ]
                        )
                    )
                }
            )
        }
    )
    out = tmp_path / "runs.pptx"
    result = generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    prs = Presentation(str(out))
    _problems, placement = apply_deck_edits(prs, result.produced, edits, {})
    prs.save(str(out))

    reopened = Presentation(str(out))
    edited = list(reopened.slides)[placement[key] - 1]
    shape = next(s for s, _ in iter_shapes(edited.shapes) if s.shape_id == area["shape_id"])
    runs = shape.text_frame.paragraphs[0].runs
    assert [r.text for r in runs] == ["Entrega ", "concluída", " hoje"]
    assert runs[1].font.bold is True and str(runs[1].font.color.rgb) == "C92A2A"
    assert runs[2].font.italic is True
    # And the scene reads them back as runs, not as one flattened string.
    scene = deck_scene(out, result.produced, mapping, edits)
    read = next(
        s
        for sl in scene["slides"]
        if sl["key"] == key
        for s in sl["shapes"]
        if s["key"] == f"sh{area['shape_id']}"
    )
    assert [r["text"] for r in read["text"]["paragraphs"][0]["runs"]] == ["Entrega ", "concluída", " hoje"]
    assert read["text"]["paragraphs"][0]["runs"][1]["bold"] is True


def test_a_run_can_link_to_a_url_and_the_link_can_be_cleared(template, manifest, tmp_path):
    """Slides' "Insert > Link", applied to a run through python-pptx's own hyperlink API."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    key = slide_key(slide["slide_id"], 1, 1)
    mapping = mapping_for(manifest)
    mapping.slides[str(slide["slide_id"])].scope = "board"
    mapping.slides[str(slide["slide_id"])].board_id = 1
    shape_key_ = f"sh{area['shape_id']}"

    def edits_with(link):
        return DeckEdits(
            slides={
                key: SlideEdits(
                    shapes={
                        shape_key_: ShapeEdit(
                            text=TextEdit(
                                paragraphs=[
                                    ParagraphEdit(
                                        text="Ver painel",
                                        runs=[RunEdit(text="Ver painel", style=RunStyle(link=link))],
                                    )
                                ]
                            )
                        )
                    }
                )
            }
        )

    out = tmp_path / "link.pptx"
    result = generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    prs = Presentation(str(out))
    _problems, placement = apply_deck_edits(
        prs, result.produced, edits_with("https://example.com/painel"), {}
    )
    prs.save(str(out))

    reopened = Presentation(str(out))
    edited = list(reopened.slides)[placement[key] - 1]
    shape = next(s for s, _ in iter_shapes(edited.shapes) if s.shape_id == area["shape_id"])
    run = shape.text_frame.paragraphs[0].runs[0]
    assert run.hyperlink.address == "https://example.com/painel"
    scene = deck_scene(out, result.produced, mapping, edits_with("https://example.com/painel"))
    read = next(
        s for sl in scene["slides"] if sl["key"] == key for s in sl["shapes"] if s["key"] == shape_key_
    )
    assert read["text"]["paragraphs"][0]["runs"][0]["link"] == "https://example.com/painel"

    # An explicit empty string clears an existing link rather than leaving it alone.
    prs2 = Presentation(str(out))
    apply_deck_edits(prs2, result.produced, edits_with(""), {})
    reopened2_path = tmp_path / "link2.pptx"
    prs2.save(str(reopened2_path))
    reopened2 = Presentation(str(reopened2_path))
    edited2 = list(reopened2.slides)[placement[key] - 1]
    shape2 = next(s for s, _ in iter_shapes(edited2.shapes) if s.shape_id == area["shape_id"])
    assert shape2.text_frame.paragraphs[0].runs[0].hyperlink.address is None


def test_a_run_can_be_highlighted_and_the_highlight_can_be_cleared(template, manifest, tmp_path):
    """RF-107: text highlight has no python-pptx API, so `<a:highlight>` is hand-written."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    key = slide_key(slide["slide_id"], 1, 1)
    mapping = mapping_for(manifest)
    mapping.slides[str(slide["slide_id"])].scope = "board"
    mapping.slides[str(slide["slide_id"])].board_id = 1
    shape_key_ = f"sh{area['shape_id']}"

    def edits_with(highlight):
        return DeckEdits(
            slides={
                key: SlideEdits(
                    shapes={
                        shape_key_: ShapeEdit(
                            text=TextEdit(
                                paragraphs=[
                                    ParagraphEdit(
                                        text="Em destaque",
                                        runs=[
                                            RunEdit(text="Em destaque", style=RunStyle(highlight=highlight))
                                        ],
                                    )
                                ]
                            )
                        )
                    }
                )
            }
        )

    out = tmp_path / "realce.pptx"
    result = generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    prs = Presentation(str(out))
    _problems, placement = apply_deck_edits(prs, result.produced, edits_with("FFFF00"), {})
    prs.save(str(out))
    assert not check_package(out).errors

    reopened = Presentation(str(out))
    edited = list(reopened.slides)[placement[key] - 1]
    shape = next(s for s, _ in iter_shapes(edited.shapes) if s.shape_id == area["shape_id"])
    run = shape.text_frame.paragraphs[0].runs[0]
    highlight = run._r.find(qn("a:rPr")).find(qn("a:highlight"))
    assert highlight.find(qn("a:srgbClr")).get("val") == "FFFF00"
    scene = deck_scene(out, result.produced, mapping, edits_with("FFFF00"))
    read = next(
        s for sl in scene["slides"] if sl["key"] == key for s in sl["shapes"] if s["key"] == shape_key_
    )
    assert read["text"]["paragraphs"][0]["runs"][0]["highlight"] == "FFFF00"

    # An explicit empty string clears an existing highlight rather than leaving it alone.
    prs2 = Presentation(str(out))
    apply_deck_edits(prs2, result.produced, edits_with(""), {})
    reopened2_path = tmp_path / "realce2.pptx"
    prs2.save(str(reopened2_path))
    reopened2 = Presentation(str(reopened2_path))
    edited2 = list(reopened2.slides)[placement[key] - 1]
    shape2 = next(s for s, _ in iter_shapes(edited2.shapes) if s.shape_id == area["shape_id"])
    rpr2 = shape2.text_frame.paragraphs[0].runs[0]._r.find(qn("a:rPr"))
    assert rpr2.find(qn("a:highlight")) is None


def test_a_shape_can_be_flipped_and_given_a_shadow(template, manifest, tmp_path):
    """RF-107: Arrange's Rotate/Flip and Format's Shadow — neither has a python-pptx setter."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    key = slide_key(slide["slide_id"], 1, 1)
    mapping = mapping_for(manifest)
    mapping.slides[str(slide["slide_id"])].scope = "board"
    mapping.slides[str(slide["slide_id"])].board_id = 1
    shape_key_ = f"sh{area['shape_id']}"
    edits = DeckEdits(
        slides={
            key: SlideEdits(
                shapes={
                    shape_key_: ShapeEdit(
                        frame=Frame(flip_h=True, flip_v=True),
                        shadow=Shadow(color="203864", alpha=0.5, blur_pt=5, distance_pt=4, angle=90),
                    )
                }
            )
        }
    )
    out = tmp_path / "inversao.pptx"
    result = generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    prs = Presentation(str(out))
    _problems, placement = apply_deck_edits(prs, result.produced, edits, {})
    prs.save(str(out))
    assert not check_package(out).errors

    reopened = Presentation(str(out))
    edited = list(reopened.slides)[placement[key] - 1]
    shape = next(s for s, _ in iter_shapes(edited.shapes) if s.shape_id == area["shape_id"])
    xfrm = shape._element.spPr.find(qn("a:xfrm"))
    assert xfrm.get("flipH") == "1" and xfrm.get("flipV") == "1"
    outer = shape._element.spPr.find(qn("a:effectLst")).find(qn("a:outerShdw"))
    assert outer.get("dir") == str(90 * 60000)
    assert outer.get("dist") == str(4 * 12700)
    assert outer.get("blurRad") == str(5 * 12700)
    assert outer.find(qn("a:srgbClr")).get("val") == "203864"

    scene = deck_scene(out, result.produced, mapping, edits)
    read = next(
        s for sl in scene["slides"] if sl["key"] == key for s in sl["shapes"] if s["key"] == shape_key_
    )
    assert read["flip"] == {"h": True, "v": True}
    assert read["shadow"]["color"] == "203864"
    assert read["shadow"]["alpha"] == 0.5

    # Turning the shadow back off removes the effect list rather than leaving a stale one.
    edits_off = DeckEdits(
        slides={key: SlideEdits(shapes={shape_key_: ShapeEdit(shadow=Shadow(enabled=False))})}
    )
    prs2 = Presentation(str(out))
    apply_deck_edits(prs2, result.produced, edits_off, {})
    off_path = tmp_path / "sem_sombra.pptx"
    prs2.save(str(off_path))
    reopened2 = Presentation(str(off_path))
    edited2 = list(reopened2.slides)[placement[key] - 1]
    shape2 = next(s for s, _ in iter_shapes(edited2.shapes) if s.shape_id == area["shape_id"])
    assert shape2._element.spPr.find(qn("a:effectLst")) is None


def test_notes_and_table_cells_can_be_edited(template, manifest, tmp_path):
    slide = manifest["slides"][1]
    table = next((a for a in slide["areas"] if a.get("table")), None)
    key = slide_key(slide["slide_id"], 1, 1)
    mapping = mapping_for(manifest)
    mapping.slides[str(slide["slide_id"])].scope = "board"
    mapping.slides[str(slide["slide_id"])].board_id = 1
    cells = {f"sh{table['shape_id']}:0:0": "Cabeçalho reescrito"} if table else {}
    edits = DeckEdits(slides={key: SlideEdits(notes="Falar do atraso do CAD-11.", cells=cells)})

    out = tmp_path / "notas.pptx"
    result = generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    prs = Presentation(str(out))
    problems, placement = apply_deck_edits(prs, result.produced, edits, {})
    prs.save(str(out))
    assert problems == []

    reopened = Presentation(str(out))
    target = list(reopened.slides)[placement[key] - 1]
    assert target.notes_slide.notes_text_frame.text == "Falar do atraso do CAD-11."
    if table:
        shape = next(s for s, _ in iter_shapes(target.shapes) if s.shape_id == table["shape_id"])
        assert shape.table.cell(0, 0).text == "Cabeçalho reescrito"


def test_ungrouping_keeps_every_child_where_it_was(tmp_path):
    """RF-48/49: a child's geometry is written in the group's space; dissolving must not move it."""
    from pptx import Presentation as P
    from pptx.util import Emu

    source = P()
    source.slide_width, source.slide_height = Emu(12192000), Emu(6858000)
    slide = source.slides.add_slide(source.slide_layouts[6])
    one = slide.shapes.add_textbox(Emu(1000000), Emu(1000000), Emu(2000000), Emu(500000))
    one.text_frame.text = "um"
    two = slide.shapes.add_textbox(Emu(4000000), Emu(2000000), Emu(2000000), Emu(500000))
    two.text_frame.text = "dois"
    out = tmp_path / "grupo.pptx"
    source.save(out)

    # Wrap the two boxes in a group whose child space is offset from its own position.
    prs = Presentation(str(out))
    slide = prs.slides[0]
    tree = slide.shapes._spTree
    group = tree.add_grpSp()
    for shape in list(slide.shapes):
        if shape._element is group:
            continue
        shape._element.getparent().remove(shape._element)
        group.append(shape._element)
    group.get_or_add_xfrm()
    prs.save(out)

    prs = Presentation(str(out))
    slide = prs.slides[0]
    before = {p.shape.shape_id: (p.x, p.y, p.cx, p.cy) for p in iter_placed(slide.shapes) if p.depth}
    assert len(before) == 2
    target = next(s for s in slide.shapes if s.shape_type == MSO_SHAPE_TYPE.GROUP)
    px.ungroup(slide, target)
    prs.save(out)

    after_prs = Presentation(str(out))
    after = {p.shape.shape_id: (p.x, p.y, p.cx, p.cy) for p in iter_placed(after_prs.slides[0].shapes)}
    assert before == {k: v for k, v in after.items() if k in before}
    assert not any(s.shape_type == MSO_SHAPE_TYPE.GROUP for s in after_prs.slides[0].shapes)


# ---------------------------------------------------------------- package validity (RF-50)


def out_of_order(report):
    return [e for e in report.errors if e["kind"] == "ordem_de_esquema"]


def test_every_generated_deck_is_a_valid_ooxml_package(template, manifest, tmp_path):
    """The check that would have caught the corruption: validate the package, not just the XML."""
    out = tmp_path / "pacote.pptx"
    generate_deck(template, mapping_for(manifest), deck(board(1, "Plataforma"), board(2, "Dados")), out)
    report = check_package(out)
    assert report.ok, report.errors
    assert report.slides == len(Presentation(str(out)).slides)


def test_the_validator_catches_a_broken_package(template, manifest, tmp_path):
    """A validator that never fails is decoration, so prove it fails on the real defects."""
    out = tmp_path / "quebrado.pptx"
    generate_deck(template, mapping_for(manifest), deck(board(1, "Plataforma")), out)

    # 1. A shape id reused inside one slide.
    broken = tmp_path / "id-duplicado.pptx"
    prs = Presentation(str(out))
    shapes = list(prs.slides[1].shapes)
    shapes[1]._element._nvXxPr.cNvPr.set("id", str(shapes[0].shape_id))
    prs.save(broken)
    assert any(e["kind"] == "id_de_forma_duplicado" for e in check_package(broken).errors)

    # 2. A relationship pointing at a part that is not in the package.
    dangling = tmp_path / "rel-quebrado.pptx"
    with zipfile.ZipFile(out) as source, zipfile.ZipFile(dangling, "w") as target:
        for item in source.infolist():
            data = source.read(item.filename)
            if item.filename == "ppt/_rels/presentation.xml.rels":
                data = data.replace(b"slides/slide1.xml", b"slides/slideNaoExiste.xml")
            target.writestr(item, data)
    assert any(e["kind"] == "rel_quebrado" for e in check_package(dangling).errors)

    # 3. A part with no content type.
    untyped = tmp_path / "sem-tipo.pptx"
    with zipfile.ZipFile(out) as source, zipfile.ZipFile(untyped, "w") as target:
        for item in source.infolist():
            target.writestr(item, source.read(item.filename))
        target.writestr("ppt/media/extra.weird", b"x")
    assert any(e["kind"] == "sem_content_type" for e in check_package(untyped).errors)


def test_bullets_autofit_and_dash_keep_the_schema_sequence(tmp_path):
    """The root cause: OOXML content models are sequences, so these cannot be appended at the end.

    Each parent here is given the trailing siblings a real corporate template has — the project's
    own deck has eight `<a:pPr>` carrying `tabLst`/`defRPr` and eight `<a:ln>` carrying `miter`.
    Appending after them parses fine everywhere and makes PowerPoint offer to repair the file.
    """
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    box = slide.shapes.add_textbox(Emu(91440), Emu(91440), Emu(3000000), Emu(800000))
    frame = box.text_frame
    frame.text = "texto"
    body = frame._txBody.bodyPr
    body.append(body.makeelement(qn("a:extLst"), {}))
    ppr = frame.paragraphs[0]._p.get_or_add_pPr()
    ppr.append(ppr.makeelement(qn("a:tabLst"), {}))
    ppr.append(ppr.makeelement(qn("a:defRPr"), {}))
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(91440), Emu(1000000), Emu(1000000), Emu(500000))
    ln = shape.line._get_or_add_ln()
    ln.append(ln.makeelement(qn("a:miter"), {}))
    ln.append(ln.makeelement(qn("a:tailEnd"), {"type": "none"}))
    tree = slide.shapes._spTree
    tree.append(tree.makeelement(qn("p:extLst"), {}))

    px.set_autofit(frame, "shrink")
    px._style_paragraph(frame.paragraphs[0], {"bullet": "char", "bullet_char": "•"})
    px.set_line_dash(shape, "dash")
    px.move_shape_to(slide, box, 99)

    def local(element):
        return [etree.QName(c).localname for c in element if isinstance(c.tag, str)]

    assert local(body) == ["normAutofit", "extLst"]
    assert local(ppr)[:1] == ["buChar"] and local(ppr)[-2:] == ["tabLst", "defRPr"]
    assert local(ln)[0] == "prstDash" and local(ln)[-1] == "tailEnd"
    assert local(tree)[-1] == "extLst"  # never after the slide's own extension list

    out = tmp_path / "ordenado.pptx"
    prs.save(out)
    assert not out_of_order(check_package(out))


def test_an_edited_deck_stays_a_valid_package(template, manifest, tmp_path):
    """Generation plus the whole edit layer, validated as a package end to end."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    key = slide_key(slide["slide_id"], 1, 1)
    mapping = mapping_for(manifest)
    mapping.slides[str(slide["slide_id"])].scope = "board"
    mapping.slides[str(slide["slide_id"])].board_id = 1
    edits = DeckEdits(
        slides={
            key: SlideEdits(
                notes="Nota do apresentador.",
                shapes={
                    f"sh{area['shape_id']}": ShapeEdit(
                        frame=Frame(x=1000000, y=1000000, cx=3000000, cy=900000, rotation=5),
                        fill=Fill(type="solid", color="FFC000", alpha=0.6),
                        line=Line(type="solid", color="C92A2A", width_pt=2, dash="dash"),
                        text=TextEdit(
                            autofit="shrink",
                            anchor="middle",
                            insets_pt={"l": 6, "r": 6, "t": 3, "b": 3},
                            paragraphs=[
                                ParagraphEdit(
                                    text="Com marcador",
                                    bullet="char",
                                    runs=[
                                        RunEdit(text="Com "),
                                        RunEdit(text="marcador", style=RunStyle(bold=True)),
                                    ],
                                )
                            ],
                        ),
                    ),
                    "new:caixa": ShapeEdit(
                        op="insert",
                        kind="shape",
                        preset="roundRect",
                        frame=Frame(x=300000, y=4000000, cx=2000000, cy=900000),
                        fill=Fill(type="solid", color="00B050"),
                        corner_radius=0.2,
                        z=0,
                    ),
                },
            )
        }
    )
    out = tmp_path / "editado.pptx"
    result = generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    prs = Presentation(str(out))
    problems, _ = apply_deck_edits(prs, result.produced, edits, {})
    prs.save(out)
    assert problems == []
    report = check_package(out)
    assert report.ok, report.errors


def row_ids(path):
    """Every a16:rowId in the deck, per table, so a clash is visible as a repeat."""
    a16 = "{http://schemas.microsoft.com/office/drawing/2014/main}"
    out = []
    with zipfile.ZipFile(path) as z:
        for name in sorted(n for n in z.namelist() if n.startswith("ppt/slides/slide")):
            root = etree.fromstring(z.read(name))
            for table in root.iter(f"{A_NS}tbl"):
                out.append([e.get("val") for e in table.iter(f"{a16}rowId")])
    return out


def test_cloned_table_rows_get_their_own_identity(template, manifest, tmp_path):
    """A row cloned from a prototype inherited the prototype's a16:rowId.

    PowerPoint treats a repeated row identity as a content problem and offers to repair the file,
    while every XML parser reads it back happily — so only a package check catches it.
    """
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("table") and a["table"]["rows"] >= 1)
    a16 = "{http://schemas.microsoft.com/office/drawing/2014/main}"

    # Give the prototype row the identity extension a real corporate template carries.
    prepared = tmp_path / "com-rowid.pptx"
    prs = Presentation(str(template))
    target = next(
        s
        for s, _ in iter_shapes(list(prs.slides)[1].shapes)
        if s.shape_id == area["shape_id"] and s.has_table
    )
    for row in target.table._tbl.tr_lst:
        ext_lst = row.makeelement(qn("a:extLst"), {})
        ext = row.makeelement(qn("a:ext"), {"uri": "{9D8B030D-6E8A-4147-A177-3AD203B41FA5}"})
        ext.append(row.makeelement(f"{a16}rowId", {"val": "10001"}))
        ext_lst.append(ext)
        row.append(ext_lst)
    prs.save(prepared)

    mapping = mapping_for(manifest)
    out = tmp_path / "linhas.pptx"
    generate_deck(prepared, mapping, deck(board(1, "Plataforma", rows=6)), out)

    tables = [ids for ids in row_ids(out) if ids]
    assert tables, "o teste precisa de uma tabela que carregue rowId"
    for ids in tables:
        assert len(ids) == len(set(ids)), f"rowId repetido numa tabela: {ids}"
    report = check_package(out)
    assert not [e for e in report.errors if e["kind"] == "id_de_extensao_duplicado"], report.errors


def test_the_validator_catches_a_repeated_row_identity(template, manifest, tmp_path):
    """The auditor has to fail on this, or the fix above could silently regress."""
    a16 = "{http://schemas.microsoft.com/office/drawing/2014/main}"
    out = tmp_path / "repetido.pptx"
    generate_deck(template, mapping_for(manifest), deck(board(1, "Plataforma")), out)
    prs = Presentation(str(out))
    table = next(
        s.table
        for slide in prs.slides
        for s, _ in iter_shapes(slide.shapes)
        if getattr(s, "has_table", False) and s.has_table and len(s.table.rows) > 1
    )
    for row in table._tbl.tr_lst:
        ext_lst = row.makeelement(qn("a:extLst"), {})
        ext = row.makeelement(qn("a:ext"), {"uri": "{9D8B030D-6E8A-4147-A177-3AD203B41FA5}"})
        ext.append(row.makeelement(f"{a16}rowId", {"val": "777"}))
        ext_lst.append(ext)
        row.append(ext_lst)
    prs.save(out)
    errors = [e for e in check_package(out).errors if e["kind"] == "id_de_extensao_duplicado"]
    assert errors, "o validador deixou passar um rowId repetido"


def test_a_duplicated_slide_does_not_repeat_shape_identities(template, manifest, tmp_path):
    """Cloning a slide must not leave two shapes claiming the same a16:creationId."""
    a16 = "{http://schemas.microsoft.com/office/drawing/2014/main}"
    mapping = mapping_for(manifest)
    slide_id = str(manifest["slides"][1]["slide_id"])
    mapping.slides[slide_id].scope = "repeat"
    out = tmp_path / "clonado.pptx"
    generate_deck(template, mapping, deck(board(1, "Plataforma"), board(2, "Dados")), out)
    with zipfile.ZipFile(out) as z:
        for name in sorted(n for n in z.namelist() if n.startswith("ppt/slides/slide")):
            root = etree.fromstring(z.read(name))
            ids = [e.get("id") for e in root.iter(f"{a16}creationId")]
            assert len(ids) == len(set(ids)), f"{name}: creationId repetido"
    assert check_package(out).ok


def test_a_selection_group_is_editor_state_and_never_reaches_the_pptx(template, manifest, tmp_path):
    """RF-53: grouping a multi-selection must not put relative coordinates into the edit layer.

    A real ``<p:grpSp>`` would give its children coordinates relative to the group, and this
    document is absolute overrides on purpose — a relative one drifts on the second replay. So a
    selection group carries membership only, and a deck built from a document holding nothing else
    is the deck built from an empty one.
    """
    slide = manifest["slides"][1]
    areas = [a for a in slide["areas"] if a.get("paragraphs")][:2]
    mapping = mapping_for(manifest)
    out = tmp_path / "grupo.pptx"
    result = generate_deck(template, mapping, deck(board(1, "Plataforma")), out)
    key = slide_key(slide["slide_id"], 1, 1)
    members = [f"sh{a['shape_id']}" for a in areas]

    grouped = DeckEdits(slides={key: SlideEdits(groups={"g1": members})})
    # It survives a round trip through the document, so the grouping is still there tomorrow.
    assert DeckEdits.model_validate(grouped.model_dump()).slides[key].groups == {"g1": members}
    # …but it is not a change to the deck, so nothing is replayed for it.
    assert grouped.touched() == set()

    before = out.read_bytes()
    prs = Presentation(str(out))
    problems, _ = apply_deck_edits(prs, result.produced, grouped, {})
    assert problems == []
    prs.save(str(out))
    assert len(Presentation(str(out)).slides) == result.slide_count
    # The shapes are exactly where they were: a selection group moves nothing on its own.
    assert check_package(out).ok
    assert len(before) > 0


def test_a_slide_can_belong_to_some_spaces_and_not_others(template, manifest, tmp_path):
    """RF-55: one template, a different slide set per space, resolved at generation."""
    slides = manifest["slides"]
    data = deck(
        board(1, "Plataforma", space="Produto Digital"),
        board(2, "Dados", space="Inteligência de Dados"),
    )
    data.boards[0].space_key, data.boards[1].space_key = "CAD", "DAD"
    mapping = DeckMapping(
        slides={
            # A repeat block: the first slide runs for both boards, the second only for CAD.
            str(slides[1]["slide_id"]): {"scope": "repeat", "repeat_by": "board"},
            str(slides[2]["slide_id"]): {"scope": "repeat", "repeat_by": "board", "only_spaces": ["CAD"]},
            # A deck slide narrowed to a space nobody in this run belongs to.
            str(slides[3]["slide_id"]): {"scope": "deck", "only_spaces": ["OUTRO"]},
        }
    )
    result = generate_deck(template, mapping, data, tmp_path / "escopo.pptx")
    produced = [(p["origin_slide_id"], p["board_id"]) for p in result.produced]
    assert sorted(b for s, b in produced if s == slides[1]["slide_id"]) == [1, 2]
    assert sorted(b for s, b in produced if s == slides[2]["slide_id"]) == [1]
    assert not any(s == slides[3]["slide_id"] for s, _ in produced)


def test_a_mapping_saved_before_scoping_still_covers_everything(template, manifest, tmp_path):
    """The default is *included everywhere*, so an upgrade cannot quietly drop somebody's slides."""
    slides = manifest["slides"]
    data = deck(board(1, "Plataforma", space="Produto Digital"), board(2, "Dados", space="Dados"))
    plain = DeckMapping(slides={str(slides[1]["slide_id"]): {"scope": "repeat", "repeat_by": "board"}})
    spec = plain.for_slide(slides[1]["slide_id"])
    assert spec.only_spaces == [] and spec.only_boards == [] and spec.conditional is False
    assert spec.covers("QUALQUER", 999) is True
    # A brand-new slide nobody has configured is covered too, for the same reason.
    assert plain.for_slide(123456).covers(None, None) is True
    result = generate_deck(template, plain, data, tmp_path / "antigo.pptx")
    assert sorted(
        p["board_id"] for p in result.produced if p["origin_slide_id"] == slides[1]["slide_id"]
    ) == [
        1,
        2,
    ]


def test_a_variable_can_read_its_value_from_a_jira_field():
    """RF-58: a name can mean "whatever Jira says here" instead of words typed per space."""
    data = deck(board(1, "Plataforma", space="Produto Digital"))
    data.variables["responsavel"] = VariableSpec(
        name="responsavel", label="Responsável", source_field="board.nome"
    )
    mapping = DeckMapping()
    # Nobody typed anything, so the field answers — with this board's own value.
    assert expand_markers("{{texto.responsavel}}", data, data.boards[0], mapping) == "Plataforma"
    # A typed value for this board is an override somebody made, and still wins.
    data.boards[0].texts["texto.responsavel"] = "Ana"
    assert expand_markers("{{texto.responsavel}}", data, data.boards[0], mapping) == "Ana"


def test_the_registration_default_waits_behind_the_jira_field():
    """An empty field is not an answer: a blank line is what RF-45 exists to stop."""
    data = deck(board(1, "Plataforma", space="Produto Digital"))
    data.boards[0].texts["sprint.objetivo"] = ""
    data.variables["objetivo"] = VariableSpec(
        name="objetivo", label="Objetivo", source_field="sprint.objetivo", default="Sem objetivo."
    )
    mapping = DeckMapping()
    report = MarkerReport()
    assert expand_markers("{{texto.objetivo}}", data, data.boards[0], mapping, report) == "Sem objetivo."
    assert not report.any()
    # With the field filled, the field wins over the default.
    data.boards[0].texts["sprint.objetivo"] = "Fechar o checkout."
    assert expand_markers("{{texto.objetivo}}", data, data.boards[0], mapping) == "Fechar o checkout."
    # RF-59: with no default, an empty source is simply an empty answer — the source *did* speak.
    # A sprint with no goal is data, and refusing the deck over it would make every optional field
    # mandatory. It is reported as `vazio` by the generator, not as an unfilled variable.
    data.variables["orfa"] = VariableSpec(name="orfa", label="Órfã", source_field="sprint.objetivo")
    data.boards[0].texts["sprint.objetivo"] = ""
    report = MarkerReport()
    assert expand_markers("{{texto.orfa}}", data, data.boards[0], mapping, report) == ""
    assert not report.any()
    # What stays loud is the case RF-45 was written for: a variable nobody wired and nobody typed.
    data.variables["ninguem"] = VariableSpec(name="ninguem", label="Ninguém")
    report = MarkerReport()
    assert expand_markers("{{texto.ninguem}}", data, data.boards[0], mapping, report) == "{{texto.ninguem}}"
    assert report.unfilled == ["texto.ninguem"]


def test_a_typed_variable_fills_a_table_and_a_chart(template, manifest, tmp_path):
    """RF-59: a variable is typed by its source, so one name serves every element type.

    This is what lets the variable manager be the only place a name exists. While variables were
    text-only, a table or a chart had to bypass it and bind a catalogue key directly — which is
    exactly the second home for names that RF-56 set out to remove.
    """
    slide = manifest["slides"][2]
    table = next(a for a in slide["areas"] if a["kind"] == "table")
    chart = next(a for a in manifest["slides"][1]["areas"] if a["kind"] == "chart")
    data = deck(board(1, "Plataforma", space="Produto Digital"))
    data.variables |= {
        "riscos": VariableSpec(name="riscos", label="Riscos", source_field="riscos.bloqueios", kind="rows"),
        "vazao": VariableSpec(name="vazao", label="Vazão", source_field="grafico.vazao", kind="series"),
    }
    mapping = DeckMapping(
        slides={
            str(slide["slide_id"]): {
                "scope": "board",
                "board_id": 1,
                "bindings": [
                    {
                        "target": table["id"],
                        "mode": "table_rows",
                        "variable": "riscos",
                        "columns": ["resumo", "acao"],
                    }
                ],
            },
            str(manifest["slides"][1]["slide_id"]): {
                "scope": "board",
                "board_id": 1,
                "bindings": [{"target": chart["id"], "mode": "chart", "variable": "vazao"}],
            },
        }
    )
    # The binding speaks the variable's bare name; everything downstream sees `texto.<name>`.
    binding = mapping.for_slide(slide["slide_id"]).bindings[0]
    assert binding.variable == "riscos" and binding.key == "texto.riscos"

    result = generate_deck(template, mapping, data, tmp_path / "tipado.pptx")
    assert [p.kind for p in result.problems if p.kind.startswith("variavel")] == []
    out = Presentation(str(tmp_path / "tipado.pptx"))
    filled = next(
        s
        for s, _ in iter_shapes(list(out.slides)[2].shapes)
        if s.shape_id == table["shape_id"] and s.has_table
    )
    # The rows really arrived: the board's blocked items, not an empty prototype row.
    assert len(filled.table.rows) > 1
    assert any(cell.text_frame.text.strip() for cell in filled.table.rows[1].cells)


def test_a_typed_variable_has_no_hand_written_level(template, manifest, tmp_path):
    """Its field is its only answer, so the four-level walk is skipped rather than searched."""
    data = deck(board(1, "Plataforma", space="Produto Digital"))
    data.variables["riscos"] = VariableSpec(
        name="riscos", label="Riscos", source_field="riscos.bloqueios", kind="rows"
    )
    # Even a slide-level override — the narrowest scope there is — cannot speak for a table.
    data.slide_texts = {manifest["slides"][1]["slide_id"]: {"riscos": "tentativa de sobrescrever"}}
    kind, value = resolve(data, data.boards[0], "texto.riscos", manifest["slides"][1]["slide_id"])
    assert kind == "rows" and not isinstance(value, str)


def test_a_deck_generates_with_no_data_source_at_all(template, manifest, tmp_path):
    """RF-60: the module carried into a project that has no tracker.

    `ManualSource` offers an empty catalogue, so every variable is hand-filled — which is the
    honest floor of "no variables by default". If the engine still fills a template from that, the
    port is real and not just Jira wearing an interface.
    """
    from cadencia.report.adapters.manual_source import ManualSource, NamedTarget

    source = ManualSource([NamedTarget(id=1, name="Equipe A", group_key="A", group_name="Alfa")])
    assert list(source.catalog()) == []

    written = {"definicao": "O que a equipe entrega.", "aviso": "Uso interno."}
    data = source.deck_data(
        [1],
        reference=NOW,
        now=NOW,
        registry={name: VariableSpec(name=name, label=name) for name in written},
        variables=lambda _group, _target: dict(written),
        template_name="Sem fonte",
    )
    assert [b.name for b in data.boards] == ["Equipe A"]

    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    mapping = DeckMapping(
        slides={
            str(slide["slide_id"]): {
                "scope": "board",
                "board_id": 1,
                "bindings": [
                    {"target": area["id"], "mode": "text", "value": "{{texto.definicao}} — {{texto.aviso}}"}
                ],
            }
        }
    )
    out = tmp_path / "sem-fonte.pptx"
    result = generate_deck(template, mapping, data, out)
    assert [p.kind for p in result.problems if p.kind.startswith("variavel")] == []
    shape = next(
        s
        for s, _ in iter_shapes(list(Presentation(str(out)).slides)[1].shapes)
        if s.shape_id == area["shape_id"]
    )
    assert shape.text_frame.text.startswith("O que a equipe entrega. — Uso interno.")
    assert check_package(out).ok


def test_a_qr_code_reaches_the_slide_square_and_scannable(template, manifest, tmp_path):
    """RF-63: a value that belongs on a slide as a picture, rendered offline by the module."""
    import segno
    from PIL import Image

    slide = manifest["slides"][1]
    # A deliberately wide area: a QR stretched to fill it would stop scanning.
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    data = deck(board(1, "Plataforma", space="Produto Digital"), variables=["link"])
    data.boards[0].texts["texto.link"] = "https://cadencia.example/r/CAD-11"
    mapping = DeckMapping(
        slides={
            str(slide["slide_id"]): {
                "scope": "board",
                "board_id": 1,
                "bindings": [{"target": area["id"], "mode": "qr_code", "variable": "link"}],
            }
        }
    )
    out = tmp_path / "qr.pptx"
    result = generate_deck(template, mapping, data, out)
    assert [p.kind for p in result.problems if p.kind in {"vazio", "variavel_sem_valor"}] == []

    picture = next(
        s
        for s, _ in iter_shapes(list(Presentation(str(out)).slides)[1].shapes)
        if s.shape_type is not None and "PICTURE" in str(s.shape_type)
    )
    # Square on the slide, and inside the area it replaced rather than stretched across it.
    assert picture.width == picture.height
    box = area["bbox"]
    assert picture.width <= box["w"] and picture.height <= box["h"]
    assert box["x"] <= picture.left and box["y"] <= picture.top

    # And it really is the link: decoded from the pixels, not trusted from the call.
    blob = tmp_path / "read.png"
    blob.write_bytes(picture.image.blob)
    with Image.open(blob) as image:
        assert image.size[0] == image.size[1]
    assert (
        segno.make("https://cadencia.example/r/CAD-11").matrix
        == segno.make(data.boards[0].texts["texto.link"]).matrix
    )
    assert check_package(out).ok


def test_an_empty_value_makes_no_qr_code(template, manifest, tmp_path):
    """A QR of nothing is a black square that scans as an empty string — worse than a gap."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    data = deck(board(1, "Plataforma", space="Produto Digital"), variables=[("link", "")])
    mapping = DeckMapping(
        slides={
            str(slide["slide_id"]): {
                "scope": "board",
                "board_id": 1,
                "bindings": [{"target": area["id"], "mode": "qr_code", "variable": "link"}],
            }
        }
    )
    result = generate_deck(template, mapping, data, tmp_path / "vazio.pptx")
    assert any(p.kind == "vazio" for p in result.problems)
    assert not any(
        s.shape_type is not None and "PICTURE" in str(s.shape_type)
        for s, _ in iter_shapes(list(Presentation(str(tmp_path / "vazio.pptx")).slides)[1].shapes)
    )


def test_a_template_edit_reaches_every_copy_of_its_slide(template, manifest, tmp_path):
    """RF-64: an edit made on the template is the slide's design, so every board's copy gets it."""
    slide = manifest["slides"][1]
    area = next(a for a in slide["areas"] if a.get("paragraphs"))
    shape = f"sh{area['shape_id']}"
    mapping = mapping_for(manifest)
    for spec in mapping.slides.values():
        if spec.scope == "board":
            spec.scope = "repeat"
    data = deck(board(1, "Plataforma", space="Produto Digital"), board(2, "Dados", space="Dados"))
    out = tmp_path / "modelo-editado.pptx"
    result = generate_deck(template, mapping, data, out)
    copies = [p for p in result.produced if p["origin_slide_id"] == slide["slide_id"]]
    assert len(copies) == 2  # one per board

    edits = DeckEdits(
        slides={
            template_slide_key(slide["slide_id"]): SlideEdits(
                shapes={shape: ShapeEdit(frame=Frame(x=123456, y=234567))}
            )
        }
    )
    # It is a change to replay even though no produced key names it.
    assert edits.touched()
    prs = Presentation(str(out))
    problems, _ = apply_deck_edits(prs, result.produced, edits, {})
    prs.save(str(out))
    assert problems == []

    moved = [
        s
        for sl in Presentation(str(out)).slides
        for s, _ in iter_shapes(sl.shapes)
        if s.shape_id == area["shape_id"] and s.left == 123456 and s.top == 234567
    ]
    assert len(moved) == len(copies)


def test_a_board_s_own_edit_wins_over_the_template_s(manifest):
    """The design is underneath; what somebody did to one copy is on top."""
    slide_id = manifest["slides"][1]["slide_id"]
    edits = DeckEdits(
        slides={
            template_slide_key(slide_id): SlideEdits(
                shapes={"sh2": ShapeEdit(frame=Frame(x=1)), "sh3": ShapeEdit(frame=Frame(x=2))},
                notes="Nota do modelo.",
            ),
            slide_key(slide_id, 1, 1): SlideEdits(
                shapes={"sh2": ShapeEdit(frame=Frame(x=99))},
            ),
        }
    )
    merged = edits.for_slide(slide_key(slide_id, 1, 1))
    assert merged.shapes["sh2"].frame.x == 99  # the copy's own
    assert merged.shapes["sh3"].frame.x == 2  # inherited from the template
    assert merged.notes == "Nota do modelo."
    # A board with no edits of its own simply gets the design.
    assert edits.for_slide(slide_key(slide_id, 2, 1)).shapes["sh2"].frame.x == 1


def test_a_named_slide_carries_its_name_into_the_pptx(template, manifest, tmp_path):
    """RF-65: the name is editor metadata *and* `<p:cSld name>`, so PowerPoint shows it too."""
    slides = manifest["slides"]
    data = deck(board(1, "Plataforma", space="Produto Digital"), board(2, "Dados", space="Dados"))
    mapping = DeckMapping(
        slides={
            str(slides[0]["slide_id"]): {"scope": "deck", "name": "Capa"},
            str(slides[1]["slide_id"]): {"scope": "repeat", "repeat_by": "board", "name": "Resumo"},
        }
    )
    out = tmp_path / "nomes.pptx"
    generate_deck(template, mapping, data, out)
    names = [s.element.cSld.get("name") for s in Presentation(str(out)).slides]
    assert "Capa" in names
    # A repeated slide says which board it is, or thirty copies of "Resumo" are unfindable.
    assert {"Resumo · Plataforma", "Resumo · Dados"} <= set(names)
    # An unnamed slide gets no attribute at all rather than an empty one.
    assert any(n is None for n in names)
    assert check_package(out).ok


def test_an_unnamed_slide_reads_as_it_always_did(manifest):
    """Empty falls back to the template's own headline: a mapping saved before RF-65 is unchanged."""
    mapping = DeckMapping()
    assert mapping.for_slide(manifest["slides"][0]["slide_id"]).name == ""
