import { describe, expect, it } from 'vitest';

import { HELP, tileHelp } from './indicatorHelp';
import { CATALOG } from './mosaic';

describe('the help for each indicator', () => {
  it('explains every tile of the Home catalogue', () => {
    for (const entry of CATALOG) expect(tileHelp(entry.type), `sem ajuda para ${entry.type}`).toBeTruthy();
  });

  it('has no help for a tile that does not exist', () => {
    const known = new Set(CATALOG.map((e) => `tile:${e.type}`));
    for (const key of Object.keys(HELP).filter((k) => k.startsWith('tile:'))) expect(known.has(key), key).toBe(true);
  });

  it('is written to be read: something to say, and not too much', () => {
    for (const [key, text] of Object.entries(HELP)) {
      expect(text.trim().length, key).toBeGreaterThan(20);
      expect(text.length, key).toBeLessThan(900);
      expect(text, key).not.toMatch(/[ \t]{2,}|\n{3,}/); // paragraphs are separated by one blank line
    }
  });

  it('shares its thresholds with the words that explain them', () => {
    // The gauge says acima/folga at these limits; the help must not drift from them.
    expect(HELP['tile:team:load']).toContain('110%');
    expect(HELP['tile:team:load']).toContain('80%');
    expect(HELP['person:load']).toContain('110%');
    expect(HELP['tile:team:blocks']).toContain('2 dias');
  });
});
