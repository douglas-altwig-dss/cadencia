import { describe, expect, it } from 'vitest';

import { setLocaleForTests } from '../i18n';

import {
  CATALOG,
  DEFAULT_TYPES,
  GROUP_LABELS,
  SIZES,
  defaultMosaic,
  moveTile,
  normalize,
  removeTile,
  resizeTile,
  setTileConfig,
  shiftTile,
  spanFor,
  toggleTile,
  type TileState,
} from './mosaic';

const ids = (tiles: TileState[]) => tiles.map((t) => t.id);
const three = (): TileState[] => [
  { id: 'a', type: 'kpi:risk', size: 'P' },
  { id: 'b', type: 'team:load', size: 'P' },
  { id: 'c', type: 'boards', size: 'G' },
];

describe('size at each screen width', () => {
  it('splits 12 columns on a desktop', () => {
    expect([spanFor('P', 'desktop'), spanFor('M', 'desktop'), spanFor('G', 'desktop')]).toEqual([3, 6, 12]);
  });

  it('makes a small tile half a row on a tablet and every tile a row on a phone', () => {
    expect([spanFor('P', 'tablet'), spanFor('M', 'tablet'), spanFor('G', 'tablet')]).toEqual([6, 6, 12]);
    expect(['P', 'M', 'G'].map((s) => spanFor(s as 'P', 'phone'))).toEqual([12, 12, 12]);
  });

  it('never asks for more than the grid has', () => {
    for (const bp of ['phone', 'tablet', 'desktop'] as const)
      for (const size of ['P', 'M', 'G'] as const) expect(spanFor(size, bp)).toBeLessThanOrEqual(12);
  });
});

describe('the catalogue and the default', () => {
  it('lists every tile once, each with a group, a size and words', () => {
    const types = CATALOG.map((e) => e.type);
    expect(new Set(types).size).toBe(types.length);
    for (const entry of CATALOG) expect(entry.label && entry.description).toBeTruthy();
  });

  it('reads its words in the language current when they are read, not when the module loaded', () => {
    const risk = CATALOG.find((e) => e.type === 'kpi:risk')!;
    const english = risk.label;
    const previous = setLocaleForTests('pt-BR');
    try {
      expect(risk.label).toBe('Itens em risco');
      expect(GROUP_LABELS.pessoas).toBe('Pessoas');
      expect(SIZES[0].hint).toBe('Pequeno: um quarto da largura');
    } finally {
      setLocaleForTests(previous);
    }
    expect(risk.label).toBe(english);
  });

  it('only defaults to tiles that exist', () => {
    const known = new Set(CATALOG.map((e) => e.type));
    expect(DEFAULT_TYPES.every((t) => known.has(t))).toBe(true);
    expect(ids(defaultMosaic().tiles)).toEqual(DEFAULT_TYPES);
  });

  it('carries over what the old customiser hid, and the table columns', () => {
    const mosaic = defaultMosaic({ hidden: ['kpi:progress', 'trend'], order: ['sprint', 'space'] });
    expect(ids(mosaic.tiles)).not.toContain('kpi:progress');
    expect(mosaic.tiles.find((t) => t.type === 'boards')?.config).toEqual({ order: ['sprint', 'space'], hidden: ['trend'] });
    // People and pulse tiles are new: hiding a KPI before they existed cannot have hidden them.
    expect(ids(mosaic.tiles)).toContain('team:load');
  });
});

describe('arranging tiles', () => {
  it('moves a tile to a position and shifts the rest', () => {
    expect(ids(moveTile(three(), 'c', 0))).toEqual(['c', 'a', 'b']);
    expect(ids(moveTile(three(), 'a', 2))).toEqual(['b', 'c', 'a']);
  });

  it('clamps a move and ignores one to the same place or from nowhere', () => {
    const tiles = three();
    expect(ids(moveTile(tiles, 'a', 99))).toEqual(['b', 'c', 'a']);
    expect(moveTile(tiles, 'a', 0)).toBe(tiles);
    expect(moveTile(tiles, 'zzz', 1)).toBe(tiles);
  });

  it('shifts one place at a time, stopping at the ends', () => {
    expect(ids(shiftTile(three(), 'b', -1))).toEqual(['b', 'a', 'c']);
    expect(ids(shiftTile(three(), 'b', 1))).toEqual(['a', 'c', 'b']);
    const tiles = three();
    expect(shiftTile(tiles, 'a', -1)).toBe(tiles);
    expect(shiftTile(tiles, 'c', 1)).toBe(tiles);
  });

  it('resizes without touching the others', () => {
    const next = resizeTile(three(), 'a', 'G');
    expect(next.map((t) => t.size)).toEqual(['G', 'P', 'G']);
    const tiles = three();
    expect(resizeTile(tiles, 'a', 'P')[0]).toBe(tiles[0]);
  });

  it('adds a hidden tile at the end in its usual size, and takes a shown one off', () => {
    const added = toggleTile(three(), 'pulse:feed');
    expect(added.at(-1)).toMatchObject({ id: 'pulse:feed', type: 'pulse:feed', size: 'M' });
    expect(ids(toggleTile(added, 'pulse:feed'))).toEqual(['a', 'b', 'c']);
  });

  it('removes by id and keeps a tile settings', () => {
    expect(ids(removeTile(three(), 'b'))).toEqual(['a', 'c']);
    expect(setTileConfig(three(), 'c', { hidden: ['data'] })[2].config).toEqual({ hidden: ['data'] });
  });
});

describe('reading a stored layout', () => {
  it('has nothing to read from junk', () => {
    for (const junk of [null, undefined, 3, 'x', {}, { tiles: 'no' }]) expect(normalize(junk)).toBeNull();
  });

  it('drops what is not a tile and keeps the first of a repeated id', () => {
    const mosaic = normalize({
      tiles: [
        { id: 'a', type: 'kpi:risk', size: 'M' },
        { id: 'a', type: 'boards', size: 'G' },
        { id: '', type: 'boards' },
        { type: 'boards' },
        7,
        { id: 'b', type: 'team:load', size: 'XL' },
      ],
    });
    expect(mosaic?.tiles).toEqual([
      { id: 'a', type: 'kpi:risk', size: 'M' },
      { id: 'b', type: 'team:load', size: 'P' }, // a bad size falls back to the tile's usual one
    ]);
  });

  it('keeps a tile of a type it does not know, so an older client never deletes it', () => {
    const mosaic = normalize({ tiles: [{ id: 'x', type: 'future:thing', size: 'G', config: { a: 1 } }] });
    expect(mosaic?.tiles).toEqual([{ id: 'x', type: 'future:thing', size: 'G', config: { a: 1 } }]);
  });

  it('round-trips a layout it wrote', () => {
    const written = defaultMosaic();
    expect(normalize(JSON.parse(JSON.stringify(written)))).toEqual(written);
  });
});
