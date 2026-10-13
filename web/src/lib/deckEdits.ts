/**
 * The manual edit layer, client side (RF-46).
 *
 * The scene from the server is the baseline and is never mutated. Every change becomes an absolute
 * override in this document — "shape sh7 is at x=1143000", not "moved right by 20" — which is what
 * lets the same document be replayed onto a freshly generated deck and land in the same place.
 *
 * Undo/redo is a stack of whole documents. The document is small (a few kilobytes even for a heavy
 * deck) and snapshots make every operation trivially reversible, including the structural ones.
 */
import type {
  CellStyle,
  DeckEdits,
  ParagraphEdit,
  SceneFill,
  SceneParagraph,
  SceneShape,
  SceneSlide,
  ShapeEdit,
  SlideEditDoc,
  ShapeFrame,
  TableEdit,
} from '../api/types';
import { ptToEmu } from './emu';

export const EMPTY_EDITS: DeckEdits = { version: 1, slides: {}, order: [], deleted: [], duplicates: {} };

export const cloneEdits = (edits: DeckEdits): DeckEdits => structuredClone(edits);

/** A shape as it will be generated: the baseline with its override laid on top. */
export interface EffectiveShape extends SceneShape {
  edit?: ShapeEdit;
  /** True when this shape carries a manual override of any kind. */
  dirty: boolean;
  /** RF-89: the canvas will not move, resize or delete it. Editor-only; never in the file. */
  locked?: boolean;
  /** RF-89: hidden while editing, to reach what is behind it. Editor-only; never in the file. */
  hidden?: boolean;
}

/** An edited paragraph in the scene's shape, so the canvas has one thing to draw. */
function asSceneParagraph(p: ParagraphEdit): SceneParagraph {
  return {
    text: p.text,
    level: p.level ?? 0,
    align: p.align ?? null,
    line_spacing: p.line_spacing ?? null,
    space_before_pt: p.space_before_pt ?? null,
    space_after_pt: p.space_after_pt ?? null,
    bullet: { kind: p.bullet ?? 'inherit', char: p.bullet_char },
    style: p.style ?? {},
    // Runs survive an edit (find & replace keeps them), so draw them rather than one flat run.
    runs: p.runs?.length
      ? p.runs.map((r) => ({ text: r.text, ...(p.style ?? {}), ...(r.style ?? {}) }))
      : [{ text: p.text, ...(p.style ?? {}) }],
  };
}

/**
 * RF-64: where an edit made on the **template** is stored — every board, every page.
 *
 * A template has no board and no page; it is the design each copy starts from. Mirrors
 * `edits.template_slide_key` on the backend, and the two must not drift.
 */
export const templateSlideKey = (originSlideId: number) => `${originSlideId}:*:*`;

/** This slide's edits with the template's underneath, exactly as `DeckEdits.for_slide` merges. */
export function slideEdits(edits: DeckEdits, slideKey: string): SlideEditDoc | undefined {
  const own = edits.slides[slideKey];
  const shared = edits.slides[templateSlideKey(Number(slideKey.split(':')[0]))];
  if (!shared) return own;
  if (!own) return shared;
  return {
    shapes: { ...shared.shapes, ...own.shapes },
    notes: own.notes ?? shared.notes,
    cells: { ...(shared.cells ?? {}), ...(own.cells ?? {}) },
    ungrouped: [...new Set([...(shared.ungrouped ?? []), ...(own.ungrouped ?? [])])],
    groups: { ...(shared.groups ?? {}), ...(own.groups ?? {}) },
    locked: [...new Set([...(shared.locked ?? []), ...(own.locked ?? [])])],
    hidden: [...new Set([...(shared.hidden ?? []), ...(own.hidden ?? [])])],
    tables: mergeTables(shared.tables, own.tables),
    background: own.background ?? shared.background,
  };
}

/** RF-91: a copy's table edit wins over the template's, column list and cell by cell. */
function mergeTables(shared?: Record<string, TableEdit>, own?: Record<string, TableEdit>): Record<string, TableEdit> {
  const out: Record<string, TableEdit> = { ...(shared ?? {}) };
  for (const [key, table] of Object.entries(own ?? {})) {
    const base = out[key];
    out[key] = base ? { col_widths: table.col_widths ?? base.col_widths, cells: { ...(base.cells ?? {}), ...(table.cells ?? {}) } } : table;
  }
  return out;
}

/** RF-91: the table as it will look, with widths and cell styles laid over the file's. */
function styledTable(table: NonNullable<SceneShape['table']>, edit?: TableEdit): NonNullable<SceneShape['table']> {
  if (!edit) return table;
  const fills = table.fills.map((row) => [...row]);
  const styles = (table.styles ?? table.cells.map((row) => row.map(() => ({})))).map((row) => row.map((s) => ({ ...s })));
  for (const [address, style] of Object.entries(edit.cells ?? {})) {
    const [r, c] = address.split(':').map(Number);
    if (r >= table.rows || c >= table.cols) continue;
    if (style.fill) fills[r][c] = style.fill === 'none' ? null : style.fill;
    const { fill: _fill, align: _align, ...run } = style;
    styles[r][c] = { ...styles[r][c], ...Object.fromEntries(Object.entries(run).filter(([, v]) => v != null)) };
  }
  const widths = edit.col_widths?.length ? table.col_widths.map((w, i) => edit.col_widths?.[i] || w) : table.col_widths;
  return { ...table, fills, styles, col_widths: widths };
}

export function shapeEdit(edits: DeckEdits, slideKey: string, shapeKey: string): ShapeEdit | undefined {
  return slideEdits(edits, slideKey)?.shapes?.[shapeKey];
}

function mergeFrame(base: ShapeFrame, frame?: Partial<ShapeFrame> | null): ShapeFrame {
  if (!frame) return base;
  return {
    x: frame.x ?? base.x,
    y: frame.y ?? base.y,
    cx: frame.cx ?? base.cx,
    cy: frame.cy ?? base.cy,
    rotation: frame.rotation ?? base.rotation,
    flip_h: frame.flip_h ?? base.flip_h,
    flip_v: frame.flip_v ?? base.flip_v,
  };
}

/** The same `outerShdw` distance/angle trig `properties.effects()` resolves server side, so a
 * shadow edit previews exactly as it will render. */
function shadowOf(shape: SceneShape, edit?: ShapeEdit): SceneShape['shadow'] {
  if (!edit || edit.shadow === undefined) return shape.shadow;
  const shadow = edit.shadow;
  if (!shadow || !shadow.enabled) return null;
  const radians = (shadow.angle * Math.PI) / 180;
  const distance = ptToEmu(shadow.distance_pt);
  return {
    blur: ptToEmu(shadow.blur_pt),
    dx: Math.round(distance * Math.cos(radians)),
    dy: Math.round(distance * Math.sin(radians)),
    color: shadow.color,
    alpha: shadow.alpha,
  };
}

/** Baseline + override, in the order the generator applies them. */
export function effectiveShape(shape: SceneShape, edit?: ShapeEdit): EffectiveShape {
  if (!edit) return { ...shape, dirty: false };
  const text =
    shape.text && edit.text?.paragraphs
      ? { ...shape.text, paragraphs: edit.text.paragraphs.map(asSceneParagraph) }
      : shape.text;
  const frame = mergeFrame({ ...shape.frame, flip_h: shape.flip?.h, flip_v: shape.flip?.v }, edit.frame);
  return {
    ...shape,
    frame,
    flip: { h: frame.flip_h ?? false, v: frame.flip_v ?? false },
    fill: edit.fill ? { ...shape.fill, ...edit.fill } : shape.fill,
    line: edit.line ? { ...shape.line, ...edit.line } : shape.line,
    shadow: shadowOf(shape, edit),
    z: edit.z ?? shape.z,
    text: text
      ? {
          ...text,
          anchor: edit.text?.anchor ?? text.anchor,
          word_wrap: edit.text?.word_wrap ?? text.word_wrap,
          autofit: edit.text?.autofit ?? text.autofit,
          columns: edit.text?.columns ?? text.columns,
          insets_pt: edit.text?.insets_pt ?? text.insets_pt,
        }
      : text,
    edit,
    dirty: true,
  };
}

/** Shapes of one slide as they will be generated: baseline, overrides, insertions, minus deletions. */
export function effectiveShapes(slide: SceneSlide, edits: DeckEdits): EffectiveShape[] {
  const merged = slideEdits(edits, slide.key);
  const slideEditsMap = merged?.shapes ?? {};
  const dissolved = new Set(merged?.ungrouped ?? []);
  const locked = new Set(merged?.locked ?? []);
  const hidden = new Set(merged?.hidden ?? []);
  const out: EffectiveShape[] = [];
  for (const shape of slide.shapes) {
    const edit = slideEditsMap[shape.key];
    if (edit?.op === 'delete') continue;
    // A dissolved group stops being a container; its children were already absolute.
    if (dissolved.has(shape.key)) continue;
    const effective = effectiveShape(shape, edit);
    if (shape.parent && dissolved.has(shape.parent)) effective.parent = null;
    if (shape.table) {
      const tableEdit = merged?.tables?.[shape.key];
      effective.table = styledTable(shape.table, tableEdit);
      if (tableEdit) effective.dirty = true;
    }
    effective.locked = locked.has(shape.key);
    effective.hidden = hidden.has(shape.key);
    out.push(effective);
  }
  const known = new Set(slide.shapes.map((s) => s.key));
  for (const [key, edit] of Object.entries(slideEditsMap)) {
    if (edit.op !== 'insert' || known.has(key)) continue;
    out.push({
      key,
      shape_id: -1,
      name: key,
      kind: edit.kind === 'image' ? 'image' : edit.kind === 'shape' ? 'shape' : 'textbox',
      z: edit.z ?? 999,
      parent: null,
      frame: { x: 0, y: 0, cx: 914400, cy: 457200, rotation: 0, ...(edit.frame ?? {}) } as ShapeFrame,
      geometry: edit.preset ?? null,
      fill: edit.fill ?? { type: edit.kind === 'shape' ? 'solid' : 'none', color: '4472C4', alpha: 1 },
      line: edit.line ?? { type: 'none' },
      placeholder: null,
      bound: false,
      bound_field: null,
      text: edit.text?.paragraphs
        ? {
            paragraphs: edit.text.paragraphs.map(asSceneParagraph),
            anchor: edit.text.anchor ?? 'top',
            word_wrap: edit.text.word_wrap ?? true,
            autofit: edit.text.autofit ?? 'none',
            columns: edit.text.columns ?? 1,
            insets_pt: edit.text.insets_pt ?? { l: 7.2, r: 7.2, t: 3.6, b: 3.6 },
          }
        : undefined,
      image: edit.image?.asset_id ? { asset_id: edit.image.asset_id } : undefined,
      edit,
      dirty: true,
    } as EffectiveShape);
  }
  return out.sort((a, b) => a.z - b.z);
}

/** The slides as they will be generated: duplicates in, deletions out, in the chosen order. */
export function effectiveSlides(scene: { slides: SceneSlide[] }, edits: DeckEdits): SceneSlide[] {
  const byKey = new Map(scene.slides.map((s) => [s.key, s]));
  const all: SceneSlide[] = [...scene.slides];
  for (const [key, source] of Object.entries(edits.duplicates)) {
    const origin = byKey.get(source);
    if (!origin) continue;
    const copy: SceneSlide = { ...origin, key, duplicate_of: source };
    all.splice(all.findIndex((s) => s.key === source) + 1, 0, copy);
    byKey.set(key, copy);
  }
  const alive = all.filter((s) => !edits.deleted.includes(s.key));
  if (!edits.order.length) return alive;
  const ranked = new Map(edits.order.map((key, index) => [key, index]));
  return [...alive].sort((a, b) => (ranked.get(a.key) ?? 1e6) - (ranked.get(b.key) ?? 1e6));
}

// ---------------------------------------------------------------- mutations
// Each returns a new document, so the caller can push it onto the undo stack as it is.

export function withShapeEdit(
  edits: DeckEdits,
  slideKey: string,
  shapeKey: string,
  patch: Partial<ShapeEdit>,
): DeckEdits {
  const next = cloneEdits(edits);
  const slide = (next.slides[slideKey] ??= { shapes: {} });
  const current = slide.shapes[shapeKey] ?? { op: 'update' as const };
  slide.shapes[shapeKey] = {
    ...current,
    ...patch,
    op: current.op === 'insert' ? 'insert' : (patch.op ?? current.op ?? 'update'),
    frame: patch.frame ? { ...(current.frame ?? {}), ...patch.frame } : current.frame,
    text: patch.text ? { ...(current.text ?? {}), ...patch.text } : current.text,
    image: patch.image ? { ...(current.image ?? {}), ...patch.image } : current.image,
  };
  return next;
}

export function withInsert(edits: DeckEdits, slideKey: string, key: string, edit: ShapeEdit): DeckEdits {
  const next = cloneEdits(edits);
  const slide = (next.slides[slideKey] ??= { shapes: {} });
  slide.shapes[key] = { ...edit, op: 'insert' };
  return next;
}

export function withDelete(edits: DeckEdits, slideKey: string, shapeKey: string): DeckEdits {
  const next = cloneEdits(edits);
  const slide = (next.slides[slideKey] ??= { shapes: {} });
  // Deleting something we ourselves inserted just drops the insertion.
  if (slide.shapes[shapeKey]?.op === 'insert') delete slide.shapes[shapeKey];
  else slide.shapes[shapeKey] = { op: 'delete' };
  return next;
}

/** Revert one shape to whatever the data produced. */
export function withReset(edits: DeckEdits, slideKey: string, shapeKey: string): DeckEdits {
  const next = cloneEdits(edits);
  delete next.slides[slideKey]?.shapes?.[shapeKey];
  return next;
}

export function withSlideOrder(edits: DeckEdits, order: string[]): DeckEdits {
  return { ...cloneEdits(edits), order };
}

export function withSlideDeleted(edits: DeckEdits, key: string, order: string[]): DeckEdits {
  const next = cloneEdits(edits);
  if (next.duplicates[key]) delete next.duplicates[key];
  else next.deleted = [...new Set([...next.deleted, key])];
  next.order = order.filter((k) => k !== key);
  delete next.slides[key];
  return next;
}

export function withSlideDuplicated(edits: DeckEdits, source: string, order: string[]): [DeckEdits, string] {
  const next = cloneEdits(edits);
  const key = `copia:${source}:${Object.keys(next.duplicates).length + 1}`;
  next.duplicates[key] = source;
  if (next.slides[source]) next.slides[key] = structuredClone(next.slides[source]);
  const at = order.indexOf(source);
  next.order = at < 0 ? [...order, key] : [...order.slice(0, at + 1), key, ...order.slice(at + 1)];
  return [next, key];
}

export function countEdits(edits: DeckEdits): number {
  const shapes = Object.values(edits.slides).reduce(
    (n, s) =>
      n +
      Object.keys(s.shapes ?? {}).length +
      Object.keys(s.cells ?? {}).length +
      (s.notes != null ? 1 : 0) +
      (s.background !== undefined ? 1 : 0),
    0,
  );
  return shapes + edits.deleted.length + Object.keys(edits.duplicates).length;
}

/** RF-89: lock or unlock shapes. A list in the document, like `groups`: nothing reaches the file. */
export function withLocked(edits: DeckEdits, slideKey: string, shapeKeys: string[], on: boolean): DeckEdits {
  const next = cloneEdits(edits);
  const slide = (next.slides[slideKey] ??= { shapes: {} });
  const current = new Set(slide.locked ?? []);
  for (const key of shapeKeys) (on ? current.add(key) : current.delete(key));
  slide.locked = [...current];
  return next;
}

/** RF-89: hide or show shapes while editing. */
export function withHidden(edits: DeckEdits, slideKey: string, shapeKeys: string[], on: boolean): DeckEdits {
  const next = cloneEdits(edits);
  const slide = (next.slides[slideKey] ??= { shapes: {} });
  const current = new Set(slide.hidden ?? []);
  for (const key of shapeKeys) (on ? current.add(key) : current.delete(key));
  slide.hidden = [...current];
  return next;
}

/** Slides' "Background" button. `null` writes an explicit "inherit", distinct from `undefined`
 * (never touched this slide's own copy — the template's own background, if any, still applies). */
export function withBackground(edits: DeckEdits, slideKey: string, fill: SceneFill | null): DeckEdits {
  const next = cloneEdits(edits);
  const slide = (next.slides[slideKey] ??= { shapes: {} });
  slide.background = fill;
  return next;
}

/** RF-91: column widths and cell styles; a `null` cell style removes that cell's override. */
export function withTableEdit(
  edits: DeckEdits,
  slideKey: string,
  shapeKey: string,
  patch: { col_widths?: number[] | null; cells?: Record<string, CellStyle | null> },
): DeckEdits {
  const next = cloneEdits(edits);
  const slide = (next.slides[slideKey] ??= { shapes: {} });
  const tables = (slide.tables ??= {});
  const table: TableEdit = { ...(tables[shapeKey] ?? {}) };
  if (patch.col_widths !== undefined) table.col_widths = patch.col_widths;
  if (patch.cells) {
    const cells = { ...(table.cells ?? {}) };
    for (const [address, style] of Object.entries(patch.cells)) {
      if (style === null) delete cells[address];
      else cells[address] = { ...(cells[address] ?? {}), ...style };
    }
    table.cells = cells;
  }
  tables[shapeKey] = table;
  return next;
}

export function withNotes(edits: DeckEdits, slideKey: string, notes: string | null): DeckEdits {
  const next = cloneEdits(edits);
  const slide = (next.slides[slideKey] ??= { shapes: {} });
  if (notes === null) delete slide.notes;
  else slide.notes = notes;
  return next;
}

export function withCell(edits: DeckEdits, slideKey: string, address: string, text: string): DeckEdits {
  const next = cloneEdits(edits);
  const slide = (next.slides[slideKey] ??= { shapes: {} });
  slide.cells = { ...(slide.cells ?? {}), [address]: text };
  return next;
}

export function withUngroup(edits: DeckEdits, slideKey: string, groupKey: string): DeckEdits {
  const next = cloneEdits(edits);
  const slide = (next.slides[slideKey] ??= { shapes: {} });
  slide.ungrouped = [...new Set([...(slide.ungrouped ?? []), groupKey])];
  return next;
}

/**
 * Group a multi-selection so it selects, moves and styles as one.
 *
 * A selection group holds **only membership**. Members keep their own absolute frames, so dragging
 * the group is still N absolute overrides in one undo step — the same thing `onChangeMany` already
 * did for a loose multi-selection — and nothing in the document becomes relative. That is why this
 * never reaches the .pptx: a group with geometry would drift the second time it was replayed.
 */
export function withGroup(edits: DeckEdits, slideKey: string, shapeKeys: string[]): [DeckEdits, string] {
  const next = cloneEdits(edits);
  const slide = (next.slides[slideKey] ??= { shapes: {} });
  const groups = (slide.groups ??= {});
  // Grouping a shape that is already in a group moves it: a shape belongs to one group at a time,
  // as it does in PowerPoint.
  const members = new Set<string>();
  for (const key of shapeKeys) {
    const existing = Object.entries(groups).find(([, keys]) => keys.includes(key));
    if (existing) for (const inner of existing[1]) members.add(inner);
    else members.add(key);
  }
  for (const [id, keys] of Object.entries(groups)) {
    const kept = keys.filter((k) => !members.has(k));
    if (kept.length > 1) groups[id] = kept;
    else delete groups[id];
  }
  const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  groups[id] = [...members];
  return [next, id];
}

/** Drop a selection group, leaving its members exactly where they are. */
export function withoutGroup(edits: DeckEdits, slideKey: string, groupId: string): DeckEdits {
  const next = cloneEdits(edits);
  const groups = next.slides[slideKey]?.groups;
  if (!groups) return next;
  delete groups[groupId];
  return next;
}

/** The selection group a shape belongs to, if any: `[id, member keys]`. */
export function groupOf(
  edits: DeckEdits,
  slideKey: string,
  shapeKey: string,
): [string, string[]] | null {
  // Through the merge, so a group made on the template is still a group on every copy.
  const groups = slideEdits(edits, slideKey)?.groups ?? {};
  const found = Object.entries(groups).find(([, keys]) => keys.includes(shapeKey));
  return found ? [found[0], found[1]] : null;
}

/**
 * Selecting one member selects the whole group, the way every slide editor behaves.
 *
 * Members that no longer exist are dropped rather than selected: a group can outlive a shape the
 * next generation did not produce, and selecting a ghost would make the transformer jump.
 */
export function expandSelection(
  edits: DeckEdits,
  slideKey: string,
  keys: string[],
  present: ReadonlySet<string>,
): string[] {
  const out = new Set<string>();
  for (const key of keys) {
    const group = groupOf(edits, slideKey, key);
    for (const member of group ? group[1] : [key]) if (present.has(member)) out.add(member);
  }
  return [...out];
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/**
 * Align a selection to its own bounding box, the way every slide editor does it.
 * A single shape aligns to the slide instead, which is the only sensible reading of "centre this".
 */
export function alignedFrames(
  shapes: EffectiveShape[],
  mode: AlignMode,
  slideWidth: number,
  slideHeight: number,
): Record<string, { x?: number; y?: number }> {
  if (!shapes.length) return {};
  const solo = shapes.length === 1;
  const left = solo ? 0 : Math.min(...shapes.map((s) => s.frame.x));
  const right = solo ? slideWidth : Math.max(...shapes.map((s) => s.frame.x + s.frame.cx));
  const top = solo ? 0 : Math.min(...shapes.map((s) => s.frame.y));
  const bottom = solo ? slideHeight : Math.max(...shapes.map((s) => s.frame.y + s.frame.cy));
  const out: Record<string, { x?: number; y?: number }> = {};
  for (const shape of shapes) {
    if (mode === 'left') out[shape.key] = { x: left };
    else if (mode === 'right') out[shape.key] = { x: right - shape.frame.cx };
    else if (mode === 'hcenter') out[shape.key] = { x: Math.round((left + right - shape.frame.cx) / 2) };
    else if (mode === 'top') out[shape.key] = { y: top };
    else if (mode === 'bottom') out[shape.key] = { y: bottom - shape.frame.cy };
    else out[shape.key] = { y: Math.round((top + bottom - shape.frame.cy) / 2) };
  }
  return out;
}

/** Equal gaps between three or more shapes, along the axis they already span most. */
export function distributedFrames(
  shapes: EffectiveShape[],
  axis: 'h' | 'v',
): Record<string, { x?: number; y?: number }> {
  if (shapes.length < 3) return {};
  const key = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'cx' : 'cy';
  const sorted = [...shapes].sort((a, b) => a.frame[key] - b.frame[key]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last.frame[key] + last.frame[size] - first.frame[key];
  const used = sorted.reduce((sum, s) => sum + s.frame[size], 0);
  const gap = (span - used) / (sorted.length - 1);
  const out: Record<string, { x?: number; y?: number }> = {};
  let cursor = first.frame[key];
  for (const shape of sorted) {
    out[shape.key] = { [key]: Math.round(cursor) } as { x?: number; y?: number };
    cursor += shape.frame[size] + gap;
  }
  return out;
}
