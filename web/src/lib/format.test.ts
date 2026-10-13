import { describe, expect, it } from 'vitest';

import { plural } from './format';

describe('plural', () => {
  it('uses the singular for exactly one, and the plural otherwise, zero included', () => {
    expect(plural(1, 'item', 'itens')).toBe('1 item');
    expect(plural(0, 'item', 'itens')).toBe('0 itens');
    expect(plural(27, 'dia útil', 'dias úteis')).toBe('27 dias úteis');
  });

  it('adds an s when no plural is given', () => {
    expect(plural(2, 'board')).toBe('2 boards');
    expect(plural(1, 'board')).toBe('1 board');
  });
});
