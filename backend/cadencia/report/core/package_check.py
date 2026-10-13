"""Is this .pptx a package PowerPoint will open without offering to repair it? (RF-50)

A deck can be perfectly good XML, convert cleanly in LibreOffice, and still make PowerPoint ask to
repair it. PowerPoint validates against the ECMA-376 schema; LibreOffice guesses. So the checks here
are the ones that separate "parses" from "valid":

* **package** — every part covered by `[Content_Types].xml`, every relationship resolving to a part
  that exists, every part reachable, no entry named with a backslash or a duplicate;
* **references** — every ``r:id`` used inside a part declared in that part's ``.rels``;
* **presentation** — the slide id list matching the slide parts, ids unique and in range;
* **slides** — shape ids unique per slide, text bodies non-empty, table rows matching the grid;
* **sequence order** — the one that bites hardest. OOXML content models are sequences, so an
  ``<a:buChar>`` written after ``<a:defRPr>``, or an ``<a:normAutofit>`` after ``<a:extLst>``, is
  invalid even though every parser in the world will read it back happily.

The result is attached to every generation, and a failure makes the run invalid, so a malformed
package stops at the API instead of reaching PowerPoint.
"""

from __future__ import annotations

import posixpath
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from lxml import etree

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"
OFF_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
CT = "{http://schemas.openxmlformats.org/package/2006/content-types}"

#: Child order per parent element, from ECMA-376 Part 1. Mirrors `pptx_utils.SEQUENCES`, but this
#: module is the auditor and deliberately keeps its own copy: a bug in one must not hide in both.
SEQUENCES: dict[str, tuple[str, ...]] = {
    f"{A}bodyPr": (
        "prstTxWarp",
        "noAutofit",
        "normAutofit",
        "spAutoFit",
        "scene3d",
        "sp3d",
        "flatTx",
        "extLst",
    ),
    f"{A}pPr": (
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
    f"{A}ln": (
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
    f"{A}p": ("pPr", "r", "br", "fld", "endParaRPr"),
    f"{A}txBody": ("bodyPr", "lstStyle", "p"),
    f"{A}tbl": ("tblPr", "tblGrid", "tr"),
    f"{P}spTree": (
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
    f"{P}cSld": ("bg", "spTree", "custDataLst", "controls", "extLst"),
}
#: Inside `<p:spTree>` the drawables are interchangeable; only the bookends are ordered.
_FREE_IN_SPTREE = {"sp", "grpSp", "graphicFrame", "cxnSp", "pic", "contentPart"}
#: XML 1.0 forbids these outright, escaped or not. Jira summaries are a reliable source of them.
ILLEGAL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
#: Microsoft extensions whose value identifies its parent and must not repeat inside it. A cloned
#: table row or shape inherits the original's, which PowerPoint reports as a content problem.
A16 = "{http://schemas.microsoft.com/office/drawing/2014/main}"
IDENTITY_EXTENSIONS = ((f"{A16}rowId", "val", "linha de tabela"), (f"{A16}colId", "val", "coluna de tabela"))
_RID_IN_XML = re.compile(r"\{[^}]*officeDocument/2006/relationships\}(?:id|embed|link|pict|dm|lo|qs|cs)")


@dataclass
class PackageReport:
    """What the checks found. ``ok`` false means the file must not be delivered."""

    errors: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[dict[str, Any]] = field(default_factory=list)
    parts: int = 0
    slides: int = 0

    @property
    def ok(self) -> bool:
        return not self.errors

    def fail(self, kind: str, message: str, **extra: Any) -> None:
        self.errors.append({"kind": kind, "message": message, **extra})

    def warn(self, kind: str, message: str, **extra: Any) -> None:
        self.warnings.append({"kind": kind, "message": message, **extra})

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "errors": self.errors,
            "warnings": self.warnings,
            "parts": self.parts,
            "slides": self.slides,
        }


def _local(element: Any) -> str:
    tag = element.tag
    return tag.split("}")[-1] if isinstance(tag, str) else ""


def _check_zip(z: zipfile.ZipFile, report: PackageReport) -> list[str]:
    names = z.namelist()
    report.parts = len(names)
    seen: set[str] = set()
    for name in names:
        if "\\" in name:
            report.fail("zip_backslash", f"Entrada do pacote com barra invertida: {name!r}")
        if name.startswith("/") or ".." in name.split("/"):
            report.fail("zip_path", f"Caminho de entrada inválido: {name!r}")
        if name in seen:
            report.fail("zip_duplicada", f"Entrada duplicada no pacote: {name!r}")
        seen.add(name)
    if "[Content_Types].xml" not in seen:
        report.fail("sem_content_types", "O pacote não tem [Content_Types].xml.")
    return names


def _check_content_types(z: zipfile.ZipFile, names: list[str], report: PackageReport) -> None:
    try:
        root = etree.fromstring(z.read("[Content_Types].xml"))
    except (KeyError, etree.XMLSyntaxError) as exc:
        report.fail("content_types_ilegivel", f"[Content_Types].xml não pôde ser lido: {exc}")
        return
    defaults = {e.get("Extension", "").lower() for e in root.findall(f"{CT}Default")}
    overrides = {e.get("PartName") for e in root.findall(f"{CT}Override")}
    for name in names:
        if name == "[Content_Types].xml":
            continue
        if f"/{name}" in overrides:
            continue
        extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if extension not in defaults:
            report.fail(
                "sem_content_type",
                f"A parte {name} não tem tipo de conteúdo (nem Override nem Default para .{extension}).",
                part=name,
            )
    for part in overrides:
        if part and part.lstrip("/") not in names:
            report.fail(
                "override_orfao",
                f"[Content_Types].xml declara {part}, que não existe no pacote.",
                part=part,
            )


def _rels_path(part: str) -> str:
    directory, filename = posixpath.split(part)
    return posixpath.join(directory, "_rels", filename + ".rels")


def _check_relationships(z: zipfile.ZipFile, names: list[str], report: PackageReport) -> None:
    known = set(names)
    referenced: set[str] = set()
    for rels in sorted(n for n in names if n.endswith(".rels")):
        base = posixpath.dirname(posixpath.dirname(rels))
        try:
            root = etree.fromstring(z.read(rels))
        except etree.XMLSyntaxError as exc:
            report.fail("rels_ilegivel", f"{rels} não é XML válido: {exc}", part=rels)
            continue
        ids: set[str] = set()
        for rel in root.findall(f"{PKG_REL}Relationship"):
            rid = rel.get("Id")
            if rid in ids:
                report.fail("rid_duplicado", f"{rels}: Id {rid} declarado duas vezes.", part=rels)
            ids.add(rid)
            if rel.get("TargetMode") == "External":
                continue
            target = rel.get("Target") or ""
            resolved = (
                target.lstrip("/")
                if target.startswith("/")
                else posixpath.normpath(posixpath.join(base, target))
            )
            referenced.add(resolved)
            if resolved not in known:
                report.fail(
                    "rel_quebrado",
                    f"{rels}: {rid} aponta para {target}, que não existe no pacote.",
                    part=rels,
                    target=target,
                )
    for name in names:
        if name.endswith(".rels") or name == "[Content_Types].xml" or name in referenced:
            continue
        report.warn(
            "parte_sem_relacionamento",
            f"A parte {name} não é alcançável por nenhuma relação.",
            part=name,
        )


def _check_rid_references(z: zipfile.ZipFile, names: list[str], report: PackageReport) -> None:
    """Every ``r:id`` used inside a part has to be declared in that part's own .rels."""
    for name in sorted(names):
        if not name.endswith(".xml") or name == "[Content_Types].xml":
            continue
        try:
            root = etree.fromstring(z.read(name))
        except etree.XMLSyntaxError as exc:
            report.fail("xml_malformado", f"{name} não é XML bem formado: {exc}", part=name)
            continue
        rels = _rels_path(name)
        declared: set[str] = set()
        if rels in names:
            try:
                rels_root = etree.fromstring(z.read(rels))
                declared = {r.get("Id") for r in rels_root.findall(f"{PKG_REL}Relationship")}
            except etree.XMLSyntaxError:
                continue
        for element in root.iter():
            if not isinstance(element.tag, str):
                continue
            for attribute, value in element.attrib.items():
                if attribute.startswith(OFF_REL) and value and value not in declared:
                    report.fail(
                        "rid_pendente",
                        f"{name}: <{_local(element)}> usa {value}, ausente de {posixpath.basename(rels)}.",
                        part=name,
                        rid=value,
                    )


def _check_presentation(z: zipfile.ZipFile, names: list[str], report: PackageReport) -> None:
    if "ppt/presentation.xml" not in names:
        report.fail("sem_presentation", "O pacote não tem ppt/presentation.xml.")
        return
    root = etree.fromstring(z.read("ppt/presentation.xml"))
    rels_root = etree.fromstring(z.read("ppt/_rels/presentation.xml.rels"))
    rels = {r.get("Id"): r.get("Target") for r in rels_root.findall(f"{PKG_REL}Relationship")}
    listed: set[str] = set()
    seen_ids: set[str] = set()
    for entry in root.findall(f"{P}sldIdLst/{P}sldId"):
        sid, rid = entry.get("id"), entry.get(f"{OFF_REL}id")
        if sid in seen_ids:
            report.fail("sldid_duplicado", f"presentation.xml lista o slide id {sid} duas vezes.")
        seen_ids.add(sid)
        try:
            number = int(sid or "0")
        except ValueError:
            number = 0
        # ECMA-376 constrains a slide id to 256 .. 2147483647; PowerPoint enforces it.
        if not 256 <= number <= 2147483647:
            report.fail("sldid_invalido", f"O slide id {sid} está fora da faixa permitida (256–2147483647).")
        target = rels.get(rid)
        if target is None:
            report.fail("sldid_sem_rel", f"presentation.xml referencia {rid}, ausente do .rels.")
            continue
        listed.add(posixpath.normpath(posixpath.join("ppt", target)))
    actual = {n for n in names if n.startswith("ppt/slides/slide") and n.endswith(".xml")}
    report.slides = len(actual)
    for missing in sorted(listed - actual):
        report.fail("slide_ausente", f"A lista de slides aponta para {missing}, que não existe.")
    for extra in sorted(actual - listed):
        report.fail("slide_fora_da_lista", f"{extra} existe no pacote mas não está em sldIdLst.")


def _check_sequence(root: Any, name: str, report: PackageReport) -> None:
    for parent_tag, order in SEQUENCES.items():
        for parent in root.iter(parent_tag):
            ranks = []
            children = []
            for child in parent:
                if not isinstance(child.tag, str):
                    continue
                local = _local(child)
                children.append(local)
                if parent_tag.endswith("spTree") and local in _FREE_IN_SPTREE:
                    ranks.append(order.index("sp"))
                elif local in order:
                    ranks.append(order.index(local))
            if ranks != sorted(ranks):
                report.fail(
                    "ordem_de_esquema",
                    f"{name}: <{_local(parent)}> tem filhos fora da ordem exigida pelo esquema: {children}",
                    part=name,
                    element=_local(parent),
                )


def _check_slides(z: zipfile.ZipFile, names: list[str], report: PackageReport) -> None:
    for name in sorted(n for n in names if n.startswith("ppt/slides/slide") and n.endswith(".xml")):
        try:
            root = etree.fromstring(z.read(name))
        except etree.XMLSyntaxError as exc:
            report.fail("xml_malformado", f"{name} não é XML bem formado: {exc}", part=name)
            continue
        seen: set[str] = set()
        for nv in root.iter(f"{P}cNvPr"):
            shape_id = nv.get("id")
            if shape_id in seen:
                report.fail(
                    "id_de_forma_duplicado",
                    f"{name}: duas formas usam o id {shape_id} (deve ser único no slide).",
                    part=name,
                )
            seen.add(shape_id)
            if shape_id in (None, "0"):
                report.fail("id_de_forma_invalido", f"{name}: forma com id {shape_id!r}.", part=name)
        for body in list(root.iter(f"{A}txBody")) + list(root.iter(f"{P}txBody")):
            if body.find(f"{A}bodyPr") is None:
                report.fail("txbody_sem_bodypr", f"{name}: corpo de texto sem <a:bodyPr>.", part=name)
            if not body.findall(f"{A}p"):
                report.fail("txbody_vazio", f"{name}: corpo de texto sem nenhum parágrafo.", part=name)
        for run in root.iter(f"{A}r"):
            if run.find(f"{A}t") is None:
                report.fail("run_sem_texto", f"{name}: <a:r> sem <a:t>.", part=name)
        for table in root.iter(f"{A}tbl"):
            columns = len(table.findall(f"{A}tblGrid/{A}gridCol"))
            rows = table.findall(f"{A}tr")
            if not rows:
                report.fail("tabela_sem_linhas", f"{name}: tabela sem nenhuma linha.", part=name)
            for index, row in enumerate(rows):
                if row.get("h") is None:
                    report.fail(
                        "linha_sem_altura",
                        f"{name}: linha {index + 1} sem o atributo 'h'.",
                        part=name,
                    )
                span = sum(int(c.get("gridSpan") or 1) for c in row.findall(f"{A}tc"))
                if span != columns:
                    report.fail(
                        "tabela_inconsistente",
                        f"{name}: linha {index + 1} cobre {span} colunas, mas a grade tem {columns}.",
                        part=name,
                    )
        for tag, attribute, what in IDENTITY_EXTENSIONS:
            for index, table in enumerate(root.iter(f"{A}tbl")):
                seen_ids: dict[str, int] = {}
                for found in table.iter(tag):
                    value = found.get(attribute)
                    seen_ids[value] = seen_ids.get(value, 0) + 1
                for value, count in seen_ids.items():
                    if count > 1:
                        report.fail(
                            "id_de_extensao_duplicado",
                            f"{name}: tabela {index + 1} repete o id de {what} {value} em {count} lugares.",
                            part=name,
                        )
        _check_sequence(root, name, report)


def _check_characters(z: zipfile.ZipFile, names: list[str], report: PackageReport) -> None:
    for name in names:
        if not (name.endswith(".xml") or name.endswith(".rels")):
            continue
        text = z.read(name).decode("utf-8", "replace")
        match = ILLEGAL_CHARS.search(text)
        if match:
            report.fail(
                "caractere_ilegal",
                f"{name}: caractere {hex(ord(match.group()))} não é permitido em XML 1.0.",
                part=name,
            )


def check_package(path: str | Path) -> PackageReport:
    """Validate a .pptx as an OOXML package. Errors mean PowerPoint would refuse it."""
    report = PackageReport()
    try:
        with zipfile.ZipFile(path) as z:
            broken = z.testzip()
            if broken is not None:
                report.fail("zip_corrompido", f"Entrada corrompida no pacote: {broken}")
                return report
            names = _check_zip(z, report)
            _check_content_types(z, names, report)
            _check_relationships(z, names, report)
            _check_rid_references(z, names, report)
            _check_presentation(z, names, report)
            _check_slides(z, names, report)
            _check_characters(z, names, report)
    except zipfile.BadZipFile as exc:
        report.fail("zip_invalido", f"O arquivo não é um pacote ZIP válido: {exc}")
    except OSError as exc:
        report.fail("io", f"Não foi possível ler o arquivo: {exc}")
    return report
