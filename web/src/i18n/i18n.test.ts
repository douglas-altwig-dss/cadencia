import { afterEach, describe, expect, it } from 'vitest';

import { fmtDay, fmtNum, fromNow, weekdays } from '../lib/format';
import { collator, currentLocale, DEFAULT_LOCALE, plural, setLocaleForTests, t } from '.';
import { parseLocale } from './runtime';

afterEach(() => {
  setLocaleForTests(DEFAULT_LOCALE);
});

describe('locale', () => {
  it('defaults to en-US and falls back to it for anything it does not speak', () => {
    expect(currentLocale()).toBe('en-US');
    expect(parseLocale(null)).toBe('en-US');
    expect(parseLocale('pt')).toBe('en-US');
    expect(parseLocale('de-DE')).toBe('de-DE');
  });

  it('reads the catalogue at call time', () => {
    expect(t().common.never).toBe('never');
    setLocaleForTests('pt-BR');
    expect(t().common.never).toBe('nunca');
    setLocaleForTests('de-DE');
    expect(t().common.never).toBe('nie');
  });
});

describe('formatting follows the locale', () => {
  it('formats calendar days without a time zone shift', () => {
    expect(fmtDay('2026-09-10')).toBe('09/10/2026');
    setLocaleForTests('pt-BR');
    expect(fmtDay('2026-09-10')).toBe('10/09/2026');
    setLocaleForTests('de-DE');
    expect(fmtDay('2026-09-10')).toBe('10.09.2026');
  });

  it('formats numbers', () => {
    expect(fmtNum(1234.5)).toBe('1,234.5');
    setLocaleForTests('pt-BR');
    expect(fmtNum(1234.5)).toBe('1.234,5');
  });

  it('lists the weekdays from Monday', () => {
    expect(weekdays()[0]).toBe('Monday');
    expect(weekdays()).toHaveLength(7);
    setLocaleForTests('pt-BR');
    expect(weekdays()[0]).toBe('segunda-feira');
    setLocaleForTests('de-DE');
    expect(weekdays()[6]).toBe('Sonntag');
  });

  it('says never and now in the current language', () => {
    expect(fromNow(null)).toBe('never');
    expect(fromNow(new Date().toISOString())).toBe('now');
    setLocaleForTests('pt-BR');
    expect(fromNow(undefined)).toBe('nunca');
  });

  it('sorts with the current language', () => {
    expect(['Óscar', 'Ana', 'Zé'].sort(collator().compare)).toEqual(['Ana', 'Óscar', 'Zé']);
  });

  it('pluralises on exactly one', () => {
    expect(plural(1, 'block', 'blocks')).toBe('1 block');
    expect(plural(0, 'Blockade', 'Blockaden')).toBe('0 Blockaden');
  });
});
