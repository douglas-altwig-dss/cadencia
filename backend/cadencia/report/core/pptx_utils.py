"""Low-level python-pptx helpers.

Every write here keeps the template's own formatting: text goes into the first run of a paragraph
(its ``rPr`` survives), new paragraphs and table rows are deep copies of existing ones, and
cloned slides share the original's layout, background and media.
"""

from __future__ import annotations

import copy
import math
import random
from collections.abc import Iterator
from typing import Any

from PIL import Image
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_SHAPE_TYPE
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn
from pptx.parts.chart import ChartPart
from pptx.parts.embeddedpackage import EmbeddedXlsxPart
from pptx.table import _Cell
from pptx.text.text import _Paragraph, _Run
from pptx.util import Pt

EMU_PER_PT = 12700
DEFAULT_FONT_PT = 12.0
LINE_SPACING = 1.2
CHAR_WIDTH = 0.5  # average glyph width as a fraction of the font size
_REL_ATTRS = (qn("r:id"), qn("r:embed"), qn("r:link"), qn("r:pict"))


# ---------------------------------------------------------------- traversal


def iter_shapes(shapes: Any, parent_id: int | None = None) -> Iterator[tuple[Any, int | None]]:
    for shape in shapes:
        yield shape, parent_id
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from iter_shapes(shape.shapes, shape.shape_id)


def find_shape(slide: Any, shape_id: int) -> Any | None:
    for shape, _ in iter_shapes(slide.shapes):
        if shape.shape_id == shape_id:
            return shape
    return None


def text_frames(shape: Any) -> Iterator[Any]:
    if getattr(shape, "has_text_frame", False) and shape.has_text_frame:
        yield shape.text_frame
    if getattr(shape, "has_table", False) and shape.has_table:
        for row in shape.table.rows:
            for cell in row.cells:
                yield cell.text_frame


def all_text_frames(slide: Any) -> Iterator[tuple[Any, Any]]:
    for shape, _ in iter_shapes(slide.shapes):
        for frame in text_frames(shape):
            yield shape, frame


# ---------------------------------------------------------------- schema-ordered insertion
#
# OOXML content models are *sequences*, not bags: `<a:bodyPr>`'s children must appear in the order
# the schema lists them, and so must `<a:pPr>`'s, `<a:ln>`'s and `<p:spTree>`'s. Appending to the
# end of a parent that already carries a later sibling — an `<a:extLst>`, an `<a:tailEnd>`, an
# `<a:defRPr>` — produces XML that parses fine, opens fine in LibreOffice, and makes PowerPoint
# offer to repair the file. Every insertion below goes through `insert_ordered`.

#: Child order per parent, from ECMA-376 Part 1 (CT_TextBodyProperties, CT_TextParagraphProperties,
#: CT_LineProperties, CT_GroupShape). Only the elements we write and the ones that can follow them
#: need to be listed; anything unknown is treated as "belongs at the end".
SEQUENCES: dict[str, tuple[str, ...]] = {
    "bodyPr": (
        "prstTxWarp",
        "noAutofit",
        "normAutofit",
        "spAutoFit",
        "scene3d",
        "sp3d",
        "flatTx",
        "extLst",
    ),
    "pPr": (
        "lnSpc",
        "spcBef",
        "spcAft",
        "buClrTx",
        "buClr",
        "buSzTx",
        "buSzPct",
        "buSzPts",
        "buFontTx",
        "buFont",
        "buNone",
        "buAutoNum",
        "buChar",
        "tabLst",
        "defRPr",
        "extLst",
    ),
    "ln": (
        "noFill",
        "solidFill",
        "gradFill",
        "pattFill",
        "prstDash",
        "custDash",
        "round",
        "bevel",
        "miter",
        "headEnd",
        "tailEnd",
        "extLst",
    ),
    "txBody": ("bodyPr", "lstStyle", "p"),
    "spPr": (
        "xfrm",
        "custGeom",
        "prstGeom",
        "noFill",
        "solidFill",
        "gradFill",
        "blipFill",
        "pattFill",
        "grpFill",
        "ln",
        "effectLst",
        "effectDag",
        "scene3d",
        "sp3d",
        "extLst",
    ),
    "rPr": (
        "ln",
        "noFill",
        "solidFill",
        "gradFill",
        "blipFill",
        "pattFill",
        "grpFill",
        "effectLst",
        "effectDag",
        "highlight",
        "uLnTx",
        "uLn",
        "uFillTx",
        "uFill",
        "latin",
        "ea",
        "cs",
        "sym",
        "hlinkClick",
        "hlinkMouseOver",
        "rtl",
        "extLst",
    ),
    "spTree": (
        "nvGrpSpPr",
        "grpSpPr",
        "sp",
        "grpSp",
        "graphicFrame",
        "cxnSp",
        "pic",
        "contentPart",
        "extLst",
    ),
}
#: In `<p:spTree>` the drawable elements are interchangeable: only `extLst` must stay last.
_SPTREE_DRAWABLES = ("sp", "grpSp", "graphicFrame", "cxnSp", "pic", "contentPart")


def _local(element: Any) -> str:
    tag = element.tag
    return tag.split("}")[-1] if isinstance(tag, str) else ""


def insert_ordered(parent: Any, child: Any, sequence: tuple[str, ...]) -> Any:
    """Put ``child`` where the schema says it goes, not merely at the end.

    Anything the sequence does not mention is assumed to sort last, which keeps unknown vendor
    extensions after the elements we understand.
    """
    name = _local(child)
    rank = sequence.index(name) if name in sequence else len(sequence)
    for existing in parent:
        other = _local(existing)
        other_rank = sequence.index(other) if other in sequence else len(sequence)
        if other_rank > rank:
            existing.addprevious(child)
            return child
    parent.append(child)
    return child


def replace_ordered(
    parent: Any, tag: str, sequence: tuple[str, ...], attrs: dict[str, str] | None = None
) -> Any:
    """Drop every element of ``tag`` under ``parent`` and insert a fresh one in the right place."""
    for existing in parent.findall(qn(tag)):
        parent.remove(existing)
    return insert_ordered(parent, parent.makeelement(qn(tag), attrs or {}), sequence)


# ---------------------------------------------------------------- text


def set_paragraph_text(paragraph: _Paragraph, text: str) -> None:
    """Replace a paragraph's text keeping the first run's formatting."""
    p = paragraph._p
    for tag in ("a:br", "a:fld"):
        for el in p.findall(qn(tag)):
            p.remove(el)
    runs = paragraph.runs
    if runs:
        runs[0].text = text
        for run in runs[1:]:
            run._r.getparent().remove(run._r)
        return
    r = p.add_r()
    end = p.find(qn("a:endParaRPr"))
    if end is not None:
        rpr = copy.deepcopy(end)
        rpr.tag = qn("a:rPr")
        r.insert(0, rpr)
    _Run(r, paragraph).text = text


def set_frame_text(frame: Any, text: str) -> None:
    """Replace a whole text frame; extra lines reuse the first paragraph's formatting."""
    lines = str(text).split("\n") if text else [""]
    paragraphs = list(frame.paragraphs)
    proto = copy.deepcopy(paragraphs[0]._p)
    for paragraph in paragraphs[1:]:
        paragraph._p.getparent().remove(paragraph._p)
    set_paragraph_text(frame.paragraphs[0], lines[0])
    body = frame._txBody
    for line in lines[1:]:
        el = copy.deepcopy(proto)
        body.append(el)
        set_paragraph_text(_Paragraph(el, frame), line)


def fill_grouped_list(
    frame: Any,
    groups: list[tuple[str, list[str]]],
    *,
    header_paragraph: int | None = None,
    item_paragraph: int | None = None,
    empty_text: str = "—",
) -> None:
    """Rebuild a "Grupo: / • item / (linha em branco)" list from the frame's own paragraphs."""
    paragraphs = list(frame.paragraphs)
    header = paragraphs[header_paragraph or 0]._p
    if item_paragraph is not None and item_paragraph < len(paragraphs):
        item = paragraphs[item_paragraph]._p
    else:
        item = next((p._p for p in paragraphs[1:] if p.text.strip()), header)
    separator = next((p._p for p in paragraphs if not p.text.strip()), None)
    protos = (
        copy.deepcopy(header),
        copy.deepcopy(item),
        copy.deepcopy(separator) if separator is not None else None,
    )
    body = frame._txBody
    for paragraph in paragraphs:
        body.remove(paragraph._p)

    def add(proto: Any, text: str) -> None:
        el = copy.deepcopy(proto)
        body.append(el)
        set_paragraph_text(_Paragraph(el, frame), text)

    if not groups:
        add(protos[0], empty_text)
        return
    for index, (title, items) in enumerate(groups):
        if index and protos[2] is not None:
            add(protos[2], "")
        add(protos[0], title)
        for line in items:
            add(protos[1], line)


def fill_lines(frame: Any, lines: list[str], *, bullet: str = "", empty_text: str = "") -> None:
    """A flat list into a text frame, every line copying the first non-empty paragraph's format."""
    paragraphs = list(frame.paragraphs)
    proto = next((p._p for p in paragraphs if p.text.strip()), paragraphs[0]._p)
    proto = copy.deepcopy(proto)
    body = frame._txBody
    for paragraph in paragraphs:
        body.remove(paragraph._p)
    for line in lines or ([empty_text] if empty_text else [""]):
        el = copy.deepcopy(proto)
        body.append(el)
        set_paragraph_text(_Paragraph(el, frame), f"{bullet} {line}".strip() if bullet else line)


ALIGNMENTS = {"esquerda": "l", "centro": "ctr", "direita": "r", "justificado": "just"}


def set_alignment(frame: Any, align: str) -> None:
    """Horizontal alignment for every paragraph of the frame; "modelo" leaves it untouched."""
    value = ALIGNMENTS.get(align)
    if value is None:
        return
    for paragraph in frame.paragraphs:
        paragraph._p.get_or_add_pPr().set("algn", value)


def set_columns(frame: Any, columns: int) -> None:
    """Flow the text in N columns, the way PowerPoint's "Columns" button does."""
    if columns and columns > 1:
        frame._txBody.bodyPr.set("numCol", str(int(columns)))


def set_shrink_to_fit(frame: Any, shrink: bool) -> None:
    """Ask PowerPoint to shrink the text until it fits, instead of letting it spill."""
    if not shrink:
        return
    set_autofit(frame, "shrink")


def paragraph_font_pt(paragraph: _Paragraph) -> float:
    for run in paragraph.runs:
        if run.font.size is not None:
            return run.font.size.pt
    end = paragraph._p.find(qn("a:endParaRPr"))
    if end is not None and end.get("sz"):
        return int(end.get("sz")) / 100
    return DEFAULT_FONT_PT


def estimate_text_height_pt(frame: Any, width_emu: int) -> float:
    """Rough height the text needs: enough to flag overflow, not to typeset."""
    width_pt = max(width_emu / EMU_PER_PT - 14.4, 10.0)  # default insets 0.1" each side
    total = 0.0
    for paragraph in frame.paragraphs:
        size = paragraph_font_pt(paragraph)
        per_line = max(int(width_pt / (size * CHAR_WIDTH)), 1)
        lines = max(math.ceil(len(paragraph.text) / per_line), 1)
        total += lines * size * LINE_SPACING
    return total + 7.2  # top + bottom insets


# ---------------------------------------------------------------- fills


def set_solid_fill(target: Any, hex_color: str) -> None:
    fill = target.fill
    fill.solid()
    fill.fore_color.rgb = RGBColor.from_string(hex_color.lstrip("#").upper())


# ---------------------------------------------------------------- tables


def row_heights(table: Any) -> list[int]:
    return [int(tr.get("h") or 0) for tr in table._tbl.tr_lst]


def cell_of(table: Any, tr: Any, col: int) -> _Cell:
    return _Cell(tr.tc_lst[col], table)


#: Microsoft extensions that carry an identity which must stay unique inside its parent. A cloned
#: row or shape inherits the original's, which is invalid and is what PowerPoint calls a "problem
#: with the content".
A16 = "{http://schemas.microsoft.com/office/drawing/2014/main}"
_UNIQUE_EXT_IDS = (
    (f"{A16}rowId", "val"),
    (f"{A16}colId", "val"),
    (f"{A16}creationId", "id"),
)


def refresh_extension_ids(element: Any, used: set[str]) -> None:
    """Give a cloned subtree fresh identity values for the extensions that require unique ones.

    ``used`` is the set already present in the destination; it is updated in place. Values are
    32-bit unsigned, which is the range PowerPoint writes.
    """
    for tag, attribute in _UNIQUE_EXT_IDS:
        for found in element.iter(tag):
            current = found.get(attribute)
            if current is not None and current not in used:
                used.add(current)
                continue
            while True:
                candidate = str(random.randint(1, 0xFFFFFFFF))
                if candidate not in used:
                    break
            used.add(candidate)
            found.set(attribute, candidate)


def used_extension_ids(element: Any) -> set[str]:
    return {
        value
        for tag, attribute in _UNIQUE_EXT_IDS
        for found in element.iter(tag)
        if (value := found.get(attribute)) is not None
    }


def rebuild_rows(
    table: Any,
    header_rows: int,
    rows: list[tuple[Any, list[str | None], dict[int, str]]],
    colors: list[dict[int, str]] | None = None,
) -> None:
    """Replace every data row with copies of prototype ``tr`` elements.

    ``rows`` holds ``(prototype_tr, values, fills)``; a ``None`` value leaves the prototype's text.
    ``colors``, aligned with ``rows``, gives text colours per column (RF-92).
    """
    tbl = table._tbl
    for tr in list(tbl.tr_lst)[header_rows:]:
        tbl.remove(tr)
    # Rows are clones of a prototype, so their a16:rowId would repeat; PowerPoint expects it unique.
    used = used_extension_ids(tbl)
    for proto, values, fills in rows:
        tr = copy.deepcopy(proto)
        refresh_extension_ids(tr, used)
        tbl.append(tr)
        cells = tr.tc_lst
        for col, value in enumerate(values):
            if col < len(cells) and value is not None:
                set_frame_text(_Cell(cells[col], table).text_frame, value)
        for col, color in fills.items():
            if col < len(cells):
                set_solid_fill(_Cell(cells[col], table), color)
    for tr, text_colors in zip(list(tbl.tr_lst)[header_rows:], colors or [], strict=False):
        cells = tr.tc_lst
        for col, color in text_colors.items():
            if col < len(cells):
                set_text_color(_Cell(cells[col], table).text_frame, color)


def estimate_row_height(table: Any, tr: Any, base_height: int) -> int:
    widths = [int(gc.get("w") or 0) for gc in table._tbl.tblGrid.gridCol_lst]
    needed = 0.0
    for col, tc in enumerate(tr.tc_lst):
        width = widths[col] if col < len(widths) else widths[-1]
        needed = max(needed, estimate_text_height_pt(_Cell(tc, table).text_frame, width))
    return max(base_height, int(needed * EMU_PER_PT))


# ---------------------------------------------------------------- slides


def slide_index(prs: Any, slide: Any) -> int:
    for index, sld_id in enumerate(prs.slides._sldIdLst):
        if int(sld_id.get("id")) == slide.slide_id:
            return index
    raise ValueError(f"slide {slide.slide_id} não está na apresentação")  # i18n: out of scope


def move_slide(prs: Any, slide: Any, new_index: int) -> None:
    lst = prs.slides._sldIdLst
    element = lst[slide_index(prs, slide)]
    lst.remove(element)
    lst.insert(new_index, element)


def delete_slide(prs: Any, slide: Any) -> None:
    lst = prs.slides._sldIdLst
    element = lst[slide_index(prs, slide)]
    rid = element.get(qn("r:id"))
    lst.remove(element)
    prs.part.drop_rel(rid)


def _clone_chart_part(chart_part: ChartPart, package: Any) -> ChartPart:
    partname = package.next_partname(ChartPart.partname_template)
    clone = ChartPart.load(partname, chart_part.content_type, package, chart_part.blob)
    remap: dict[str, str] = {}
    for rid, rel in list(chart_part.rels.items()):
        if rel.is_external:
            remap[rid] = clone.relate_to(rel.target_ref, rel.reltype, is_external=True)
            continue
        target = rel.target_part
        if isinstance(target, EmbeddedXlsxPart):
            target = EmbeddedXlsxPart(
                package.next_partname(EmbeddedXlsxPart.partname_template),
                target.content_type,
                package,
                target.blob,
            )
        remap[rid] = clone.relate_to(target, rel.reltype)
    _rewrite_rids(clone._element, remap)
    return clone


def _rewrite_rids(root: Any, remap: dict[str, str]) -> None:
    for el in root.iter():
        for attr in _REL_ATTRS:
            value = el.get(attr)
            if value in remap:
                el.set(attr, remap[value])


def duplicate_slide(prs: Any, source: Any, index: int | None = None) -> Any:
    """Copy ``source`` (shapes, background, images, charts) and place it at ``index``."""
    new = prs.slides.add_slide(source.slide_layout)
    tree = new.shapes._spTree
    for shape in list(new.shapes):
        tree.remove(shape._element)
    used = used_extension_ids(tree)
    for el in list(source.shapes._spTree)[2:]:  # skip nvGrpSpPr and grpSpPr
        clone = copy.deepcopy(el)
        refresh_extension_ids(clone, used)
        tree.append(clone)
    remap: dict[str, str] = {}
    for rid, rel in list(source.part.rels.items()):
        if rel.reltype in (RT.SLIDE_LAYOUT, RT.NOTES_SLIDE):
            continue
        if rel.is_external:
            remap[rid] = new.part.relate_to(rel.target_ref, rel.reltype, is_external=True)
        elif rel.reltype == RT.CHART:
            remap[rid] = new.part.relate_to(_clone_chart_part(rel.target_part, prs.part.package), RT.CHART)
        else:
            remap[rid] = new.part.relate_to(rel.target_part, rel.reltype)
    _rewrite_rids(tree, remap)
    background = source._element.cSld.bg
    if background is not None:
        new._element.cSld.insert(0, copy.deepcopy(background))
    if source.has_notes_slide:
        _copy_notes(source, new)
    if index is not None:
        move_slide(prs, new, index)
    return new


def _copy_notes(source: Any, new: Any) -> None:
    """Speaker notes travel with the copy, formatting and all.

    Repeated and paginated slides used to be born without them, so a note written once on the
    template reached only the first board's copy (found while making notes templatable, RF-94).
    """
    frame = source.notes_slide.notes_text_frame
    if frame is None:
        return
    target = new.notes_slide.notes_text_frame
    if target is None:
        return
    body = target._txBody
    for paragraph in list(body.p_lst):
        body.remove(paragraph)
    for paragraph in frame._txBody.p_lst:
        insert_ordered(body, copy.deepcopy(paragraph), SEQUENCES["txBody"])


def set_slide_name(slide: Any, name: str) -> None:
    """Write the slide's name into `<p:cSld name="…">` (RF-65).

    PowerPoint shows it in the selection pane and the outline, so a name given here survives the
    deck leaving Cadência — which is most of the point of naming a slide at all. The attribute is
    optional in the schema, so an empty name removes it rather than writing `name=""`.
    """
    element = slide.element.cSld
    if name:
        element.set("name", name)
    elif element.get("name") is not None:
        del element.attrib["name"]


def place_picture(slide: Any, shape: Any, image_path: str, *, fit: bool = False) -> Any:
    """Put an image over ``shape``'s area, at its z-order position, and drop the shape.

    ``fit`` keeps the image's own aspect ratio and centres it inside the area instead of stretching
    it to fill. A chart wants the whole box; a QR code stretched out of square stops scanning, and
    a logo stretched looks like a mistake somebody made on purpose.
    """
    left, top, width, height = shape.left, shape.top, shape.width, shape.height
    if fit:
        with Image.open(image_path) as image:
            native_w, native_h = image.size
        if native_w > 0 and native_h > 0:
            scale = min(width / native_w, height / native_h)
            new_w, new_h = int(native_w * scale), int(native_h * scale)
            left, top = left + (width - new_w) // 2, top + (height - new_h) // 2
            width, height = new_w, new_h
    picture = slide.shapes.add_picture(image_path, left, top, width, height)
    element = shape._element
    parent = element.getparent()
    parent.insert(parent.index(element), picture._element)
    parent.remove(element)
    return picture


# ---------------------------------------------------------------- editing primitives (RF-46)
#
# Everything below writes through python-pptx's own element API wherever one exists, and appends
# plain DrawingML where it does not. Nothing here invents markup PowerPoint has to repair.

PRESETS = {
    "rect": MSO_SHAPE.RECTANGLE,
    "roundRect": MSO_SHAPE.ROUNDED_RECTANGLE,
    "ellipse": MSO_SHAPE.OVAL,
    "triangle": MSO_SHAPE.ISOSCELES_TRIANGLE,
    "diamond": MSO_SHAPE.DIAMOND,
    "arrow": MSO_SHAPE.RIGHT_ARROW,
    # "line" is not here on purpose: it is a connector (`<p:cxnSp>`), a different element type,
    # and `edits._insert_shape` branches to `add_connector` before this table is ever consulted.
    "star": MSO_SHAPE.STAR_5_POINT,
}
_ANCHORS = {"top": "t", "middle": "ctr", "bottom": "b"}
_ALIGNMENTS = {"left": "l", "center": "ctr", "right": "r", "justify": "just"}
_DASHES = {"solid": "solid", "dash": "dash", "dot": "sysDot", "dashDot": "dashDot", "lgDash": "lgDash"}


def preset_shape(name: str) -> Any:
    return PRESETS.get(name, MSO_SHAPE.RECTANGLE)


def _solid_fill_element(target: Any) -> Any | None:
    """The ``<a:solidFill>`` of a shape or cell, if it currently has one."""
    holder = getattr(target, "fill", None)
    if holder is None:
        return None
    try:
        return holder._xPr.find(qn("a:solidFill"))
    except AttributeError:
        return None


def set_fill_alpha(target: Any, alpha: float) -> None:
    """Transparency on a solid fill: ``<a:alpha val="…"/>`` inside the colour, as PowerPoint writes it."""
    solid = _solid_fill_element(target)
    if solid is None or not len(solid):
        return
    color = solid[0]
    for existing in color.findall(qn("a:alpha")):
        color.remove(existing)
    element = color.makeelement(qn("a:alpha"), {"val": str(int(max(0.0, min(alpha, 1.0)) * 100000))})
    color.append(element)


def set_line_color(shape: Any, hex_color: str) -> None:
    shape.line.color.rgb = RGBColor.from_string(hex_color.lstrip("#").upper())


def set_line_dash(shape: Any, dash: str) -> None:
    ln = shape.line._get_or_add_ln()
    replace_ordered(ln, "a:prstDash", SEQUENCES["ln"], {"val": _DASHES.get(dash, "solid")})


def set_shadow(shape: Any, shadow: dict[str, Any] | None) -> None:
    """``<a:effectLst><a:outerShdw>`` has no python-pptx API either; `None` removes it."""
    spPr = shape._element.spPr
    for existing in spPr.findall(qn("a:effectLst")):
        spPr.remove(existing)
    if shadow is None:
        return
    effect_lst = insert_ordered(spPr, spPr.makeelement(qn("a:effectLst"), {}), SEQUENCES["spPr"])
    outer = effect_lst.makeelement(
        qn("a:outerShdw"),
        {
            "blurRad": str(round(float(shadow.get("blur_pt", 4.0)) * EMU_PER_PT)),
            "dist": str(round(float(shadow.get("distance_pt", 3.0)) * EMU_PER_PT)),
            "dir": str(round(float(shadow.get("angle", 45.0)) * 60000)),
            "rotWithShape": "0",
        },
    )
    color = outer.makeelement(
        qn("a:srgbClr"), {"val": str(shadow.get("color") or "000000").lstrip("#").upper()}
    )
    alpha = float(shadow.get("alpha", 0.6))
    if alpha < 1:
        color.append(color.makeelement(qn("a:alpha"), {"val": str(round(alpha * 100000))}))
    outer.append(color)
    effect_lst.append(outer)


def set_corner_radius(shape: Any, fraction: float) -> None:
    """Rounded-rectangle corner, as the adjustment PowerPoint itself drags (0 … 0.5)."""
    try:
        adjustments = shape.adjustments
        if len(adjustments):
            adjustments[0] = max(0.0, min(float(fraction), 0.5))
    except (AttributeError, NotImplementedError, ValueError, IndexError):
        return


def set_crop(picture: Any, crop: dict[str, float]) -> None:
    for side in ("left", "right", "top", "bottom"):
        if side in crop:
            try:
                setattr(picture, f"crop_{side}", max(0.0, min(float(crop[side]), 0.9)))
            except (AttributeError, ValueError):
                continue


def set_anchor(frame: Any, anchor: str) -> None:
    frame._txBody.bodyPr.set("anchor", _ANCHORS.get(anchor, "t"))


def set_insets(frame: Any, insets_pt: dict[str, float]) -> None:
    sides = (("l", "margin_left"), ("r", "margin_right"), ("t", "margin_top"), ("b", "margin_bottom"))
    for side, attribute in sides:
        if side in insets_pt:
            setattr(frame, attribute, round(float(insets_pt[side]) * EMU_PER_PT))


def set_autofit(frame: Any, mode: str) -> None:
    body = frame._txBody.bodyPr
    for tag in ("a:noAutofit", "a:spAutoFit", "a:normAutofit"):
        for element in body.findall(qn(tag)):
            body.remove(element)
    tag = {"shrink": "a:normAutofit", "resize": "a:spAutoFit"}.get(mode, "a:noAutofit")
    insert_ordered(body, body.makeelement(qn(tag), {}), SEQUENCES["bodyPr"])


def _set_highlight(run: _Run, color: str | None) -> None:
    """``<a:highlight>`` has no python-pptx API; a `None` leaves it alone, `""` clears it."""
    rpr = run._r.get_or_add_rPr()
    for existing in rpr.findall(qn("a:highlight")):
        rpr.remove(existing)
    if not color:
        return
    highlight = rpr.makeelement(qn("a:highlight"), {})
    srgb = highlight.makeelement(qn("a:srgbClr"), {"val": color.lstrip("#").upper()})
    highlight.append(srgb)
    insert_ordered(rpr, highlight, SEQUENCES["rPr"])


def _style_run(run: _Run, style: dict[str, Any]) -> None:
    font = run.font
    if style.get("font"):
        font.name = style["font"]
    if style.get("size_pt"):
        font.size = Pt(float(style["size_pt"]))
    for key in ("bold", "italic", "underline"):
        if style.get(key) is not None:
            setattr(font, key, bool(style[key]))
    if style.get("color"):
        font.color.rgb = RGBColor.from_string(str(style["color"]).lstrip("#").upper())
    highlight = style.get("highlight")
    if highlight is not None:
        _set_highlight(run, highlight or None)
    link = style.get("link")
    if link is not None:
        run.hyperlink.address = link or None


def set_run_style(
    run: _Run,
    *,
    bold: bool | None = None,
    italic: bool | None = None,
    color: str | None = None,
    size_pt: float | None = None,
) -> None:
    """Style one run through python-pptx's own font API; ``None`` leaves that property alone."""
    _style_run(run, {"bold": bold, "italic": italic, "color": color, "size_pt": size_pt})


def set_paragraph_align(paragraph: _Paragraph, align: str) -> None:
    paragraph._p.get_or_add_pPr().set("algn", _ALIGNMENTS.get(align, "l"))


def set_text_color(frame: Any, color: str) -> None:
    """Every run of a frame in one colour (RF-92's rules colour a value, not a word of it)."""
    for paragraph in frame.paragraphs:
        for run in paragraph.runs:
            _style_run(run, {"color": color})


def _style_paragraph(paragraph: _Paragraph, spec: dict[str, Any]) -> None:
    ppr = paragraph._p.get_or_add_pPr()
    if spec.get("align"):
        ppr.set("algn", _ALIGNMENTS.get(spec["align"], "l"))
    paragraph.level = max(0, min(int(spec.get("level") or 0), 8))
    if spec.get("line_spacing"):
        paragraph.line_spacing = float(spec["line_spacing"])
    if spec.get("space_before_pt") is not None:
        paragraph.space_before = Pt(float(spec["space_before_pt"]))
    if spec.get("space_after_pt") is not None:
        paragraph.space_after = Pt(float(spec["space_after_pt"]))
    bullet = spec.get("bullet")
    if bullet:
        for tag in ("a:buNone", "a:buChar", "a:buAutoNum"):
            for element in ppr.findall(qn(tag)):
                ppr.remove(element)
        if bullet == "char":
            attrs = {"char": spec.get("bullet_char") or "•"}
            insert_ordered(ppr, ppr.makeelement(qn("a:buChar"), attrs), SEQUENCES["pPr"])
        elif bullet == "number":
            attrs = {"type": "arabicPeriod"}
            insert_ordered(ppr, ppr.makeelement(qn("a:buAutoNum"), attrs), SEQUENCES["pPr"])
        else:
            insert_ordered(ppr, ppr.makeelement(qn("a:buNone"), {}), SEQUENCES["pPr"])


def write_paragraphs(frame: Any, paragraphs: list[dict[str, Any]]) -> None:
    """Replace a frame's text with fully specified paragraphs, keeping the first one's formatting
    as the base so anything the edit leaves unsaid still looks like the template."""
    if not paragraphs:
        paragraphs = [{"text": ""}]
    existing = list(frame.paragraphs)
    proto = copy.deepcopy(existing[0]._p)
    body = frame._txBody
    for paragraph in existing[1:]:
        body.remove(paragraph._p)
    first = frame.paragraphs[0]
    for index, spec in enumerate(paragraphs):
        if index == 0:
            target = first
        else:
            element = copy.deepcopy(proto)
            body.append(element)
            target = _Paragraph(element, frame)
        runs = spec.get("runs")
        if runs:
            # Mixed formatting: each run keeps its own look, which is what a bold word needs.
            set_runs(target, runs, spec.get("style") or {})
        else:
            set_paragraph_text(target, spec.get("text", ""))
            for run in target.runs:
                _style_run(run, spec.get("style") or {})
        _style_paragraph(target, spec)


def set_runs(paragraph: _Paragraph, runs: list[dict[str, Any]], base: dict[str, Any]) -> None:
    """Rewrite a paragraph as a sequence of runs, each carrying its own formatting."""
    p = paragraph._p
    existing = list(paragraph.runs)
    proto = copy.deepcopy(existing[0]._r) if existing else None
    for run in existing:
        p.remove(run._r)
    for spec in runs or [{"text": ""}]:
        if proto is not None:
            element = copy.deepcopy(proto)
            end = p.find(qn("a:endParaRPr"))
            if end is not None:
                end.addprevious(element)
            else:
                p.append(element)
            run = _Run(element, paragraph)
        else:
            run = _Run(p.add_r(), paragraph)
        run.text = spec.get("text", "")
        _style_run(run, {**base, **(spec.get("style") or {})})


def ungroup(slide: Any, group: Any) -> list[Any]:
    """Dissolve a group, keeping every child exactly where it looked (RF-49).

    A child's ``xfrm`` is written in the group's coordinate space, so moving the element up the
    tree without rewriting it would teleport the shape. Each child is therefore given its absolute
    geometry — the same mapping :mod:`cadencia.report.core.geometry` reads — before the group element is
    dropped.
    """
    from cadencia.report.core.geometry import group_transform

    transform = group_transform(group)
    element = group._element
    parent = element.getparent()
    moved = []
    for child in list(group.shapes):
        child_element = child._element
        x, y, cx, cy = transform.apply(
            int(child.left or 0), int(child.top or 0), int(child.width or 0), int(child.height or 0)
        )
        child_element.getparent().remove(child_element)
        element.addprevious(child_element)
        moved.append(child_element)
        for shape in slide.shapes:
            if shape._element is child_element:
                shape.left, shape.top, shape.width, shape.height = x, y, max(cx, 1), max(cy, 1)
                if transform.rotation:
                    shape.rotation = float(shape.rotation or 0) + transform.rotation
                break
    parent.remove(element)
    return moved


def set_notes(slide: Any, text: str) -> None:
    """Speaker notes, created on demand — a slide may never have had a notes part."""
    frame = slide.notes_slide.notes_text_frame
    set_frame_text(frame, text)


def move_shape_to(slide: Any, shape: Any, index: int) -> None:
    """Z-order: the shape tree's document order is the paint order, front last."""
    tree = slide.shapes._spTree
    element = shape._element
    drawable = ("}sp", "}pic", "}graphicFrame", "}grpSp", "}cxnSp")
    siblings = [child for child in tree if child.tag.endswith(drawable)]
    if element not in siblings:
        return
    tree.remove(element)
    siblings = [child for child in siblings if child is not element]
    position = max(0, min(index, len(siblings)))
    if position < len(siblings):
        siblings[position].addprevious(element)
    else:
        # Last among the drawables, but still before anything that must follow them.
        insert_ordered(tree, element, SEQUENCES["spTree"])


# ---------------------------------------------------------------- alternative text (#15)


def _cnvpr(shape: Any) -> Any | None:
    """The shape's ``cNvPr`` (non-visual properties), where PowerPoint keeps name and description."""
    found = shape._element.xpath("./*[1]/p:cNvPr")
    return found[0] if found else None


def alt_text(shape: Any) -> str:
    """The alternative text a screen reader says for ``shape`` (PowerPoint's "Texto Alt")."""
    element = _cnvpr(shape)
    return (element.get("descr") or "").strip() if element is not None else ""


def set_alt_text(shape: Any, text: str) -> None:
    """Write the alternative text; an empty string removes it."""
    element = _cnvpr(shape)
    if element is None:
        return
    if text.strip():
        element.set("descr", text.strip())
    elif "descr" in element.attrib:
        del element.attrib["descr"]
