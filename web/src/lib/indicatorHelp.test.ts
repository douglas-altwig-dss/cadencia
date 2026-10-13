import { describe, expect, it } from 'vitest';

import { LOCALES, setLocaleForTests } from '../i18n';
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

  it('is written to be read, in every language: something to say, and not too much', () => {
    for (const locale of LOCALES) {
      const previous = setLocaleForTests(locale);
      try {
        for (const [key, text] of Object.entries(HELP)) {
          expect(text.trim().length, `${locale} ${key}`).toBeGreaterThan(20);
          expect(text.length, `${locale} ${key}`).toBeLessThan(900);
          expect(text, `${locale} ${key}`).not.toMatch(/[ \t]{2,}|\n{3,}/); // paragraphs are separated by one blank line
        }
      } finally {
        setLocaleForTests(previous);
      }
    }
  });

  it('follows the language at the moment it is read', () => {
    const previous = setLocaleForTests('pt-BR');
    try {
      expect(HELP['sample:low']).toContain('Menos de cinco itens');
    } finally {
      setLocaleForTests(previous);
    }
    expect(HELP['sample:low']).not.toContain('Menos de cinco itens');
  });

  it('shares its thresholds with the words that explain them', () => {
    // The gauge says acima/folga at these limits; the help must not drift from them, in any language.
    for (const locale of LOCALES) {
      const previous = setLocaleForTests(locale);
      try {
        expect(HELP['tile:team:load']).toContain('110%');
        expect(HELP['tile:team:load']).toContain('80%');
        expect(HELP['person:load']).toContain('110%');
      } finally {
        setLocaleForTests(previous);
      }
    }
    const previous = setLocaleForTests('pt-BR');
    try {
      expect(HELP['tile:team:blocks']).toContain('2 dias');
    } finally {
      setLocaleForTests(previous);
    }
  });
});
