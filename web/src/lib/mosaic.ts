/**
 * The Home mosaic as pure data and pure functions: what a tile is, how big it is at each screen
 * width, and how a layout is moved, resized, added, removed and read back from storage.
 *
 * Nothing here knows React, and nothing knows how a tile is drawn — `components/home` maps a tile's
 * `type` to a component. That is what lets the arrangement be tested without a browser.
 */

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

export const SIZES: { value: TileSize; label: string; hint: string }[] = [
  { value: 'P', label: 'P', hint: 'Pequeno: um quarto da largura' },
  { value: 'M', label: 'M', hint: 'Médio: metade da largura' },
  { value: 'G', label: 'G', hint: 'Grande: a largura toda' },
];

export type TileGroup = 'indicadores' | 'pessoas' | 'acontecendo' | 'boards' | 'sistema';

export interface CatalogEntry {
  type: string;
  label: string;
  description: string;
  group: TileGroup;
  size: TileSize;
}

export const GROUP_LABELS: Record<TileGroup, string> = {
  indicadores: 'Indicadores dos boards',
  pessoas: 'Pessoas',
  acontecendo: 'O que está acontecendo',
  boards: 'Boards e sprints',
  sistema: 'Sistema',
};

/** Every tile that can be on the Home page, in the order the catalogue lists them. */
export const CATALOG: CatalogEntry[] = [
  { type: 'kpi:risk', group: 'indicadores', size: 'P', label: 'Itens em risco', description: 'Quantos itens estão em risco agora, somando todos os boards.' },
  { type: 'kpi:throughput', group: 'indicadores', size: 'P', label: 'Vazão da janela', description: 'Itens concluídos na janela atual, contra a anterior.' },
  { type: 'kpi:progress', group: 'indicadores', size: 'P', label: 'Progresso médio', description: 'Itens concluídos ÷ itens da sprint, média entre boards (sem ponderar).' },
  { type: 'kpi:adherence', group: 'indicadores', size: 'P', label: 'Aderência ao compromisso', description: 'O que foi entregue do que se comprometeu, sprint a sprint.' },
  { type: 'sprint:scope', group: 'indicadores', size: 'P', label: 'Escopo adicionado', description: 'Itens que entraram nas sprints depois do início.' },
  { type: 'team:load', group: 'pessoas', size: 'P', label: 'Carga do time', description: 'Horas abertas contra a capacidade que resta na sprint.' },
  { type: 'team:overloaded', group: 'pessoas', size: 'P', label: 'Pessoas acima da capacidade', description: 'Quem tem mais horas abertas que capacidade, para conversar cedo.' },
  { type: 'team:blocks', group: 'pessoas', size: 'P', label: 'Bloqueios ativos', description: 'Quantos bloqueios há, com que gravidade e há quanto tempo.' },
  { type: 'team:delivered', group: 'pessoas', size: 'P', label: 'Entregas na sprint', description: 'O que o time entregou até agora, contra o comprometido.' },
  { type: 'pulse:recent', group: 'acontecendo', size: 'P', label: 'Entregas recentes', description: 'Entregas por dia nos últimos 7 dias, contra os 7 anteriores.' },
  { type: 'pulse:feed', group: 'acontecendo', size: 'M', label: 'Acontecendo agora', description: 'O que foi entregue, bloqueado ou entrou na sprint nas últimas 48 horas.' },
  { type: 'pulse:due', group: 'acontecendo', size: 'P', label: 'Vencendo em 7 dias', description: 'Itens com prazo na próxima semana e os que já venceram.' },
  { type: 'sprint:elapsed', group: 'boards', size: 'M', label: 'Sprint em curso', description: 'Quanto da sprint já passou e quanto já foi concluído, por board.' },
  { type: 'kanban:boards', group: 'boards', size: 'M', label: 'Boards kanban', description: 'Vazão da semana e itens em risco, por board kanban acompanhado.' },
  { type: 'boards', group: 'boards', size: 'G', label: 'Tabela de boards', description: 'Uma linha por board: progresso, risco, vazão, tendência e coleta.' },
  { type: 'saude:pontos', group: 'sistema', size: 'P', label: 'Saúde dos dados', description: 'Pontos de atenção de higiene nos boards acompanhados: itens sem estimativa, pouco histórico concluído e afins.' },
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
