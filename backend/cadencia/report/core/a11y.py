"""Accessibility check of a deck (#15), read off the scene the editor draws.

Three things a screen-reader user or somebody at the back of the room notices first:

* a picture or chart with no alternative text is silent;
* text whose colour is too close to what it sits on cannot be read (WCAG 2.1: 4.5:1, or 3:1 for
  text of 18 pt, 14 pt bold);
* a slide whose title placeholder is not first in reading order is read out of order.

Pure: it takes the scene dict `scene.deck_scene` produces and returns findings. A finding's
``message`` is a ``{"$msg": …}`` record; the boundary renders it in the reader's language.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from cadencia.i18n.message import Msg

SILENT_KINDS = frozenset({"image", "chart"})


def _luminance(hex_color: str) -> float:
    value = hex_color.lstrip("#")
    channels = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast(a: str, b: str) -> float:
    high, low = sorted((_luminance(a), _luminance(b)), reverse=True)
    return round((high + 0.05) / (low + 0.05), 2)


def _valid(color: Any) -> str | None:
    text = str(color or "").lstrip("#")
    return text.upper() if len(text) == 6 and all(c in "0123456789abcdefABCDEF" for c in text) else None


def _large(style: Mapping[str, Any]) -> bool:
    size = float(style.get("size_pt") or 0)
    return size >= 18 or (size >= 14 and bool(style.get("bold")))


def audit(scene: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Findings, one per problem: ``{"kind", "slide", "shape", "message"}``."""
    background = _valid((scene.get("theme") or {}).get("background")) or "FFFFFF"
    findings: list[dict[str, Any]] = []
    for slide in scene.get("slides", []):
        number = slide.get("index")
        shapes = [s for s in slide.get("shapes", []) if not s.get("container")]
        for shape in shapes:
            name = shape.get("name") or shape.get("key")
            if shape.get("kind") in SILENT_KINDS and not (shape.get("alt") or "").strip():
                findings.append(
                    {
                        "kind": "sem_texto_alternativo",
                        "slide": number,
                        "shape": shape.get("key"),
                        "message": Msg("a11y.no_alt_text", slide=number, shape=name).to_json(),
                    }
                )
            text = shape.get("text")
            if not text:
                continue
            fill = shape.get("fill") or {}
            behind = _valid(fill.get("color")) if fill.get("type") not in (None, "none") else None
            behind = behind or background
            worst: tuple[float, float] | None = None
            for paragraph in text.get("paragraphs", []):
                for run in paragraph.get("runs", []):
                    color = _valid(run.get("color"))
                    if not color or not (run.get("text") or "").strip():
                        continue
                    ratio = contrast(color, behind)
                    needed = 3.0 if _large(run) else 4.5
                    if ratio < needed and (worst is None or ratio < worst[0]):
                        worst = (ratio, needed)
            if worst is not None:
                findings.append(
                    {
                        "kind": "contraste_baixo",
                        "slide": number,
                        "shape": shape.get("key"),
                        "message": Msg(
                            "a11y.low_contrast", slide=number, shape=name, ratio=worst[0], minimum=worst[1]
                        ).to_json(),
                    }
                )
        titles = [
            i
            for i, s in enumerate(shapes)
            if (s.get("placeholder") or {})
            .get("type", "")
            .upper()
            .endswith(("TITLE (1)", "CENTER_TITLE (3)"))
        ]
        readable = [i for i, s in enumerate(shapes) if s.get("text") or s.get("kind") in SILENT_KINDS]
        if titles and readable and titles[0] != readable[0]:
            findings.append(
                {
                    "kind": "ordem_de_leitura",
                    "slide": number,
                    "shape": shapes[titles[0]].get("key"),
                    "message": Msg("a11y.title_order", slide=number).to_json(),
                }
            )
    return findings


def summary(findings: list[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for finding in findings:
        out[finding["kind"]] = out.get(finding["kind"], 0) + 1
    return out
