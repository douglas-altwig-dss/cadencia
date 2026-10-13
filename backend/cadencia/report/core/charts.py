"""Chart areas (RF-41): native charts get new series data, keeping their style; any other area
gets a rendered image placed exactly over it."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from pptx.chart.data import CategoryChartData

from cadencia.report.core.context import Series

EMU_PER_INCH = 914400
FALLBACK_COLORS = ["#0E5C5B", "#9C5510", "#2C6844", "#5B6CB0", "#8A4F7D", "#7B8884"]


def replace_chart_data(chart: Any, series: Series) -> None:
    data = CategoryChartData()
    data.categories = series.categories
    for name, values in series.series.items():
        data.add_series(name, [float(v) for v in values])
    chart.replace_data(data)


def _font_available(name: str) -> bool:
    """The template's font is used when installed; otherwise matplotlib's default, quietly."""
    from matplotlib import font_manager

    logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
    try:
        font_manager.findfont(font_manager.FontProperties(family=name), fallback_to_default=False)
    except ValueError:
        return False
    return True


def render_chart_png(
    series: Series,
    path: Path,
    width_emu: int,
    height_emu: int,
    *,
    colors: list[str] | None = None,
    font: str | None = None,
) -> Path:
    """Draw ``series`` as an image sized to the area, in the style it asks for."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    palette = [c if c.startswith("#") else f"#{c}" for c in (colors or [])] or FALLBACK_COLORS
    width_in = max(width_emu / EMU_PER_INCH, 1.0)
    height_in = max(height_emu / EMU_PER_INCH, 0.8)
    rc: dict[str, Any] = {"font.size": 9}
    if font and _font_available(font):
        rc["font.family"] = [font, "DejaVu Sans"]
    with plt.rc_context(rc):
        fig, ax = plt.subplots(figsize=(width_in, height_in), dpi=200)
        draw = _STYLES.get(series.style, _bars)
        draw(ax, series, palette)
        ax.spines[["top", "right"]].set_visible(False)
        if series.x_label:
            ax.set_xlabel(series.x_label)
        if series.y_label:
            ax.set_ylabel(series.y_label)
        fig.tight_layout()
        fig.savefig(path, transparent=True)
        plt.close(fig)
    return path


def _legend(ax: Any, count: int) -> None:
    if count > 1:
        ax.legend(frameon=False, fontsize=8)


def _bars(ax: Any, series: Series, palette: list[str]) -> None:
    names = list(series.series)
    width = 0.8 / max(len(names), 1)
    positions = range(len(series.categories))
    for i, name in enumerate(names):
        offsets = [p - 0.4 + width * (i + 0.5) for p in positions]
        ax.bar(offsets, series.series[name], width=width, label=name, color=palette[i % len(palette)])
    ax.set_xticks(list(positions))
    ax.set_xticklabels(series.categories)
    ax.grid(axis="y", alpha=0.25)
    _legend(ax, len(names))


def _thin_ticks(ax: Any, categories: list[str], most: int = 10) -> None:
    step = max(1, len(categories) // most)
    ticks = list(range(0, len(categories), step))
    ax.set_xticks(ticks)
    ax.set_xticklabels([categories[i] for i in ticks])


def _stacked_area(ax: Any, series: Series, palette: list[str]) -> None:
    """Cumulative flow: the first series is the bottom band (done), the last the top (to do)."""
    names = list(series.series)
    x = list(range(len(series.categories)))
    ax.stackplot(
        x,
        *[series.series[n] for n in names],
        labels=names,
        colors=[palette[i % len(palette)] for i in range(len(names))],
        alpha=0.9,
    )
    _thin_ticks(ax, series.categories)
    ax.margins(x=0)
    ax.grid(axis="y", alpha=0.25)
    handles, labels = ax.get_legend_handles_labels()
    ax.legend(handles[::-1], labels[::-1], frameon=False, fontsize=7, loc="upper left")


def _line(ax: Any, series: Series, palette: list[str]) -> None:
    names = list(series.series)
    x = list(range(len(series.categories)))
    for i, name in enumerate(names):
        ax.plot(x, series.series[name], label=name, color=palette[i % len(palette)], linewidth=2, marker="o")
    _thin_ticks(ax, series.categories)
    ax.grid(axis="y", alpha=0.25)
    _legend(ax, len(names))


def _scatter(ax: Any, series: Series, palette: list[str]) -> None:
    """Aging: one dot per item, its column on x and its age on y; the P85 line when given."""
    xs = [m["x"] for m in series.marks]
    ys = [m["y"] for m in series.marks]
    ax.scatter(xs, ys, color=palette[0], s=22, zorder=3)
    for mark in series.marks:
        if mark.get("label"):
            ax.annotate(
                mark["label"], (mark["x"], mark["y"]), fontsize=6, xytext=(3, 2), textcoords="offset points"
            )
    for name, values in series.series.items():  # reference lines, e.g. the historical P85
        if values:
            ax.axhline(values[0], color=palette[1 % len(palette)], linestyle="--", linewidth=1, label=name)
    ax.set_xticks(list(range(len(series.categories))))
    ax.set_xticklabels(series.categories)
    ax.set_xlim(-0.5, max(len(series.categories) - 0.5, 0.5))
    ax.grid(axis="y", alpha=0.25)
    if series.series:
        ax.legend(frameon=False, fontsize=7)


def _gantt(ax: Any, series: Series, palette: list[str]) -> None:
    """One lane per category (top to bottom), bars from ``start`` to ``end`` working hours."""
    lanes = list(series.categories)
    index = {lane: i for i, lane in enumerate(lanes)}
    for mark in series.marks:
        row = index.get(mark["lane"])
        if row is None:
            continue
        ax.barh(
            row,
            mark["end"] - mark["start"],
            left=mark["start"],
            color=mark.get("color") or palette[0],
            edgecolor="#00000040",
            height=0.7,
        )
        if mark.get("label") and mark["end"] - mark["start"] >= 2:
            ax.text(
                (mark["start"] + mark["end"]) / 2, row, mark["label"], ha="center", va="center", fontsize=5.5
            )
    day = series.series.get("jornada", [6.0])[0] or 6.0
    end = max((m["end"] for m in series.marks), default=day)
    days = int(end // day) + 1
    ax.set_xticks([d * day for d in range(days + 1)])
    ax.set_xticklabels([f"D{d + 1}" if d < days else "" for d in range(days + 1)], fontsize=6)
    ax.set_yticks(list(range(len(lanes))))
    ax.set_yticklabels(lanes, fontsize=7)
    ax.invert_yaxis()
    ax.set_xlim(0, days * day)
    ax.grid(axis="x", alpha=0.3)


_STYLES = {
    "bar": _bars,
    "stacked_area": _stacked_area,
    "line": _line,
    "scatter": _scatter,
    "gantt": _gantt,
}
