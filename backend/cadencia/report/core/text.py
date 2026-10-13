"""Inline ``{{marcador}}`` replacement that survives PowerPoint's run splitting (RF-40).

PowerPoint splits a paragraph into runs for invisible reasons (a spell check is enough), so
``{{sprint.nome}}`` is often stored as ``{{sprint.`` + ``no`` + ``me}}``. Before replacing, the
runs covering each marker are merged into the first of them, which keeps its formatting.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterator
from typing import Any

from cadencia.report.core.pptx_utils import all_text_frames

MARKER = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def _bounds(runs: list[Any]) -> list[tuple[int, int]]:
    out = []
    pos = 0
    for run in runs:
        out.append((pos, pos + len(run.text)))
        pos += len(run.text)
    return out


def normalize_runs(paragraph: Any) -> int:
    """Merge runs so that no marker spans more than one run. Returns merges performed."""
    merges = 0
    while True:
        runs = list(paragraph.runs)
        if len(runs) < 2:
            return merges
        text = "".join(r.text for r in runs)
        bounds = _bounds(runs)
        split = None
        for match in MARKER.finditer(text):
            first = next(i for i, (a, b) in enumerate(bounds) if a <= match.start() < b)
            last = next(i for i, (a, b) in enumerate(bounds) if a < match.end() <= b)
            if first != last:
                split = (first, last)
                break
        if split is None:
            return merges
        first, last = split
        runs[first].text = "".join(runs[i].text for i in range(first, last + 1))
        for i in range(last, first, -1):
            element = runs[i]._r
            element.getparent().remove(element)
        merges += 1


#: RF-94: a marker may end in ``|modificador`` to say how a list is written into running text:
#: ``{{riscos.itens|contagem}}`` is "3", ``|chaves`` is "CAD-11, CAD-14", ``|lista`` one per line.
MODIFIERS = ("contagem", "chaves", "lista")


def split_marker(raw: str) -> tuple[str, str | None]:
    base, bar, modifier = raw.partition("|")
    return base.strip(), (modifier.strip().lower() or None) if bar else None


def marker_base(raw: str) -> str:
    """The field or variable a marker names, without its modifier."""
    return split_marker(raw)[0]


def markers_in(text: str) -> list[str]:
    return [m.group(1).strip() for m in MARKER.finditer(text)]


def replace_in_paragraph(paragraph: Any, resolve: Callable[[str], str]) -> list[str]:
    """Replace every marker in ``paragraph``; returns the marker names found."""
    normalize_runs(paragraph)
    found: list[str] = []
    for run in paragraph.runs:
        if "{{" not in run.text:
            continue

        def sub(match: re.Match[str]) -> str:
            name = match.group(1).strip()
            found.append(name)
            return resolve(name)

        run.text = MARKER.sub(sub, run.text)
    return found


def iter_paragraphs(slide: Any) -> Iterator[Any]:
    for _shape, frame in all_text_frames(slide):
        yield from frame.paragraphs


def replace_in_slide(slide: Any, resolve: Callable[[str], str]) -> list[str]:
    found: list[str] = []
    for paragraph in iter_paragraphs(slide):
        found += replace_in_paragraph(paragraph, resolve)
    return found


def leftover_markers(slide: Any) -> list[str]:
    left: list[str] = []
    for paragraph in iter_paragraphs(slide):
        left += markers_in(paragraph.text)
    return left
