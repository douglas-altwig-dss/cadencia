/**
 * The Home mosaic as pure data and pure functions: what a tile is, how big it is at each screen
 * width, and how a layout is moved, resized, added, removed and read back from storage.
 *
 * Nothing here knows React, and nothing knows how a tile is drawn — `components/home` maps a tile's
 * `type` to a component. That is what lets the arrangement be tested without a browser.
 */

import { t } from '../i18n';

export type TileSize = 'P' | 'M' | 'G';
export type Breakpoint = 'phone' | 'tablet' | 'desktop';

export interface TileState {
  /** One tile per type, so the id is the type; kept separate so a future "two of a kind" is not a migration. */
  id: string;
  type: string;
  size: TileSize;
  config?: Record<string, unknown>;
}

export interface Mosaic {
  version: 1;
  tiles: TileState[];
}

/** Columns a tile takes out of 12. On a phone everything is a row of its own; on a tablet a small tile is half. */
const SPANS: Record<Breakpoint, Record<TileSize, number>> = {
  desktop: { P: 3, M: 6, G: 12 },
  tablet: { P: 6, M: 6, G: 12 },
  phone: { P: 12, M: 12, G: 12 },
};

export const spanFor = (size: TileSize, breakpoint: Breakpoint): number => SPANS[breakpoint][size];

export interface SizeOption {
  value: TileSize;
  /** One letter, in the current language. */
  readonly label: string;
  /** "Small: a quarter of the width", the tooltip of the size control. */
  readonly hint: string;
}

const sizeOption = (value: TileSize): SizeOption => ({
  value,
  get label() {
    return t().shell.mosaic.sizes[value].label;
  },
  get hint() {
    return t().shell.mosaic.sizes[value].hint;
  },
});

/** The three sizes; `label` and `hint` read the current language each time they are read. */
export const SIZES: SizeOption[] = (['P', 'M', 'G'] as const).map(sizeOption);

export type TileGroup = 'indicadores' | 'pessoas' | 'acontecendo' | 'boards' | 'sistema';

export interface CatalogEntry {
  type: string;
  readonly label: string;
  readonly description: string;
  group: TileGroup;
  size: TileSize;
}

const GROUPS: TileGroup[] = ['indicadores', 'pessoas', 'acontecendo', 'boards', 'sistema'];

/** Each group's name, read in the current language when it is read (a getter per group). */
export const GROUP_LABELS: Readonly<Record<TileGroup, string>> = Object.defineProperties(
  {},
  Object.fromEntries(GROUPS.map((group) => [group, { enumerable: true, get: () => t().shell.mosaic.groups[group] }])),
) as Record<TileGroup, string>;

/** A catalogue entry whose title and description follow the language at the moment they are read. */
const entry = (type: string, group: TileGroup, size: TileSize): CatalogEntry => ({
  type,
  group,
  size,
  get label() {
    return t().shell.mosaic.tiles[type]?.label ?? type;
  },
  get description() {
    return t().shell.mosaic.tiles[type]?.description ?? '';
  },
});

/** Every tile that can be on the Home page, in the order the catalogue lists them. */
export const CATALOG: CatalogEntry[] = [
  entry('kpi:risk', 'indicadores', 'P'),
  entry('kpi:throughput', 'indicadores', 'P'),
  entry('kpi:progress', 'indicadores', 'P'),
  entry('kpi:adherence', 'indicadores', 'P'),
  entry('sprint:scope', 'indicadores', 'P'),
  entry('team:load', 'pessoas', 'P'),
  entry('team:overloaded', 'pessoas', 'P'),
  entry('team:blocks', 'pessoas', 'P'),
  entry('team:delivered', 'pessoas', 'P'),
  entry('pulse:recent', 'acontecendo', 'P'),
  entry('pulse:feed', 'acontecendo', 'M'),
  entry('pulse:due', 'acontecendo', 'P'),
  entry('sprint:elapsed', 'boards', 'M'),
  entry('kanban:boards', 'boards', 'M'),
  entry('boards', 'boards', 'G'),
  entry('saude:pontos', 'sistema', 'P'),
];

export const entryOf = (type: string): CatalogEntry | undefined => CATALOG.find((e) => e.type === type);

const tile = (type: string, config?: Record<string, unknown>): TileState => ({
  id: type,
  type,
  size: entryOf(type)?.size ?? 'M',
  ...(config ? { config } : {}),
});

/**
 * What the page shows until somebody arranges it: the indicators, people and what is happening, then the
 * boards once. The board's own progress, sprint time and kanban rows are all in the table already (M25),
 * so they are catalogue entries, not defaults. A layout saved before this keeps its tiles.
 */
export const DEFAULT_TYPES = [
  'kpi:risk',
  'kpi:throughput',
  'kpi:progress',
  'kpi:adherence',
  'team:load',
  'team:overloaded',
  'team:blocks',
  'pulse:feed',
  'boards',
];

/** The pre-mosaic layout (RF-97), kept in the browser: which KPIs were hidden and how the table's columns were. */
export interface LegacyLayout {
  order?: string[];
  hidden?: string[];
}

/** The default arrangement, honouring what somebody had already hidden in the old customiser. */
export function defaultMosaic(legacy?: LegacyLayout | null): Mosaic {
  const hidden = new Set(legacy?.hidden ?? []);
  const tiles = DEFAULT_TYPES.filter((type) => !hidden.has(type)).map((type) =>
    type === 'boards' && legacy
      ? tile(type, {
          ...(legacy.order?.length ? { order: legacy.order } : {}),
          hidden: (legacy.hidden ?? []).filter((id) => !id.includes(':')),
        })
      : tile(type),
  );
  return { version: 1, tiles };
}

const isSize = (value: unknown): value is TileSize => value === 'P' || value === 'M' || value === 'G';

/**
 * Read a stored layout back. Whatever does not look like a tile is dropped and a repeated id keeps
 * its first; a tile of a type this version does not know is *kept*, so an older client saving over a
 * newer one does not silently delete somebody's tile. Returns null when there is nothing usable.
 */
export function normalize(raw: unknown): Mosaic | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { tiles?: unknown }).tiles)) return null;
  const seen = new Set<string>();
  const tiles: TileState[] = [];
  for (const item of (raw as { tiles: unknown[] }).tiles) {
    if (!item || typeof item !== 'object') continue;
    const { id, type, size, config } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof type !== 'string' || !id || !type || seen.has(id)) continue;
    seen.add(id);
    tiles.push({
      id,
      type,
      size: isSize(size) ? size : (entryOf(type)?.size ?? 'M'),
      ...(config && typeof config === 'object' && !Array.isArray(config) ? { config: config as Record<string, unknown> } : {}),
    });
  }
  return { version: 1, tiles };
}

export const hasTile = (tiles: TileState[], type: string) => tiles.some((t) => t.type === type);

/** Put a tile where another one is: it lands at that position and the ones in between shift over. */
export function moveTile(tiles: TileState[], id: string, to: number): TileState[] {
  const from = tiles.findIndex((t) => t.id === id);
  if (from < 0) return tiles;
  const target = Math.min(Math.max(to, 0), tiles.length - 1);
  if (target === from) return tiles;
  const next = tiles.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

/** One place earlier (-1) or later (+1): the keyboard's way of dragging. */
export function shiftTile(tiles: TileState[], id: string, delta: -1 | 1): TileState[] {
  const at = tiles.findIndex((t) => t.id === id);
  return at < 0 ? tiles : moveTile(tiles, id, at + delta);
}

export function resizeTile(tiles: TileState[], id: string, size: TileSize): TileState[] {
  return tiles.map((t) => (t.id === id && t.size !== size ? { ...t, size } : t));
}

export function setTileConfig(tiles: TileState[], id: string, config: Record<string, unknown>): TileState[] {
  return tiles.map((t) => (t.id === id ? { ...t, config } : t));
}

/** Show a tile that is hidden (at the end, in its usual size), or take it off when it is on. */
export function toggleTile(tiles: TileState[], type: string): TileState[] {
  return hasTile(tiles, type) ? tiles.filter((t) => t.type !== type) : [...tiles, tile(type)];
}

export function removeTile(tiles: TileState[], id: string): TileState[] {
  return tiles.filter((t) => t.id !== id);
}
