// Display helpers. Every computation happens in UTC on the server; the UI shows the
// configured time zone (loaded from /api/health), per the PRD.

let displayTimeZone = 'America/Sao_Paulo';

export function setDisplayTimeZone(tz: string | undefined) {
  if (tz) displayTimeZone = tz;
}

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = displayTimeZone + JSON.stringify(options);
  let value = cache.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat('pt-BR', { timeZone: displayTimeZone, ...options });
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
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function fmtNum(value?: number | null, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

export function fmtPct(ratio?: number | null): string {
  if (ratio === null || ratio === undefined) return '—';
  return `${Math.round(ratio * 100)}%`;
}

export function fmtDays(value?: number | null): string {
  return value === null || value === undefined ? '—' : `${fmtNum(value)} d`;
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

export function fromNow(iso?: string | null): string {
  if (!iso) return 'nunca';
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'agora';
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const WEEKDAYS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** The time zones the screens offer; any IANA name is accepted by the API. */
export const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Recife', 'America/Bahia', 'America/Noronha', 'UTC', 'Europe/Lisbon', 'America/New_York'];

/** "1 item", "3 itens": the count and the right form of the word, so no text says "item(ns)". */
export const plural = (count: number, one: string, many?: string) => `${count} ${count === 1 ? one : (many ?? `${one}s`)}`;
