import { describe, expect, it } from 'vitest';

import { linkWith } from './filters';

describe('linkWith', () => {
  it('returns the path alone when there is nothing to carry', () => {
    expect(linkWith('/boards/1', {})).toBe('/boards/1');
  });

  it('adds the query when the path has none', () => {
    expect(linkWith('/boards/1', { person: 'jira:abc' })).toBe('/boards/1?person=jira%3Aabc');
  });

  it('merges into a query the path already has, instead of appending a second "?"', () => {
    expect(linkWith('/boards/1?tab=risks', { person: 'x' })).toBe('/boards/1?person=x&tab=risks');
  });

  it('lets the path own key win over a carried one', () => {
    expect(linkWith('/boards/1?tab=risks', { tab: 'overview', board: '1' })).toBe('/boards/1?tab=risks&board=1');
  });

  it('keeps the hash', () => {
    expect(linkWith('/issues/CAD-1#historico', { board: '2' })).toBe('/issues/CAD-1?board=2#historico');
  });
});
