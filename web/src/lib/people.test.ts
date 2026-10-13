import { describe, expect, it } from 'vitest';

import { blockSeverity, visiblePeople } from './people';

const people = [
  { account_id: 'a', name: 'Ana Souza' },
  { account_id: 'b', name: 'Bruno Lima' },
  { account_id: 'c', name: 'Carla Mendes' },
  { account_id: 'd', name: 'Ána Paula' },
];
// Ana and Carla have something in the sprint; Bruno does not; nobody knows about Ána.
const active = new Map([
  ['a', true],
  ['b', false],
  ['c', true],
]);
const names = (list: typeof people) => list.map((p) => p.name);

describe('who is listed', () => {
  it('lists everybody when the activity filter is off', () => {
    const { shown, hidden } = visiblePeople(people, active, '', false);
    expect(names(shown)).toEqual(['Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Ána Paula']);
    expect(hidden).toEqual([]);
  });

  it('hides whoever has no activity, and whoever the overview does not know', () => {
    const { shown, hidden } = visiblePeople(people, active, '', true);
    expect(names(shown)).toEqual(['Ana Souza', 'Carla Mendes']);
    expect(names(hidden)).toEqual(['Bruno Lima', 'Ána Paula']);
  });

  it('applies the search first, so the hidden count is about what the search found', () => {
    const { shown, hidden } = visiblePeople(people, active, 'bruno', true);
    expect(shown).toEqual([]);
    expect(names(hidden)).toEqual(['Bruno Lima']);
    expect(visiblePeople(people, active, 'zzz', true)).toEqual({ shown: [], hidden: [] });
  });

  it('searches by any part of the name, ignoring case', () => {
    expect(names(visiblePeople(people, active, 'SOUZA', true).shown)).toEqual(['Ana Souza']);
    expect(names(visiblePeople(people, active, 'ar', true).shown)).toEqual(['Carla Mendes']);
  });
});

describe('how severe a block is', () => {
  it('is low under two days, medium up to five, high beyond', () => {
    expect(blockSeverity(0)).toBe('baixa');
    expect(blockSeverity(1)).toBe('baixa');
    expect(blockSeverity(2)).toBe('media');
    expect(blockSeverity(5)).toBe('media');
    expect(blockSeverity(6)).toBe('alta');
  });
});
