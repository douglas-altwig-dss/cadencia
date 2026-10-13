// Display helpers. Every computation happens in UTC on the server; the UI shows the
// configured time zone (loaded from /api/health), per the PRD. Every Intl formatter follows the
// current language (docs/i18n.md), read at call time and cached per language.

import { currentLocale, plural as pluralOf, t } from '../i18n';

let displayTimeZone = 'America/Sao_Paulo';

export function setDisplayTimeZone(tz: string | undefined) {
  if (tz) displayTimeZone = tz;
}

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions, timeZone = displayTimeZone): Intl.DateTimeFormat {
  const locale = currentLocale();
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let value = cache.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat(locale, { timeZone, ...options });
    cache.set(key, value);
  }
  return value;
}

export function fmtDate(iso?: string | null, withYear = false): string {
  if (!iso) return '—';
  return formatter({ day: '2-digit', month: '2-digit', ...(withYear ? { year: 'numeric' } : {}) }).format(new Date(iso));
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return formatter({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Calendar dates (YYYY-MM-DD) have no time zone: format without converting. */
export function fmtDay(value?: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return formatter({ day: '2-digit', month: '2-digit', year: 'numeric' }, 'UTC').format(new Date(Date.UTC(year, month - 1, day)));
}

const numbers = new Map<string, Intl.NumberFormat>();

function numberFormat(digits: number): Intl.NumberFormat {
  const locale = currentLocale();
  const key = `${locale}|${digits}`;
  let value = numbers.get(key);
  if (!value) {
    value = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
    numbers.set(key, value);
  }
  return value;
}

export function fmtNum(value?: number | null, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return numberFormat(digits).format(value);
}

export function fmtPct(ratio?: number | null): string {
  if (ratio === null || ratio === undefined) return '—';
  return `${Math.round(ratio * 100)}%`;
}

export function fmtDays(value?: number | null): string {
  return value === null || value === undefined ? '—' : `${fmtNum(value)} d`;
}

const relatives = new Map<string, Intl.RelativeTimeFormat>();

function relative(): Intl.RelativeTimeFormat {
  const locale = currentLocale();
  let value = relatives.get(locale);
  if (!value) {
    value = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    relatives.set(locale, value);
  }
  return value;
}

export function fromNow(iso?: string | null): string {
  if (!iso) return t().common.never;
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative().format(Math.round(seconds / size), unit);
  }
  return t().common.now;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The days of the week in the current language, Monday first (index 0 = Monday, as the API counts). */
export function weekdays(): string[] {
  const day = formatter({ weekday: 'long' }, 'UTC');
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, index) => day.format(new Date(Date.UTC(2024, 0, 1 + index))));
}

/** The time zones the screens offer; any IANA name is accepted by the API. */
export const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Recife', 'America/Bahia', 'America/Noronha', 'UTC', 'Europe/Lisbon', 'America/New_York'];

/**
 * "1 item", "3 itens": the count and the right form of the word, so no text says "item(ns)".
 * Delegates to the i18n `plural`; without `many` it adds an s, which only suits some words.
 */
export const plural = (count: number, one: string, many?: string) => pluralOf(count, one, many ?? `${one}s`);
