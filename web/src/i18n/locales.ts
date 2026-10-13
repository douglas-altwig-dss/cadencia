// The languages the web app speaks (docs/i18n.md). The order is the picker's order.

export const LOCALES = ['en-US', 'pt-BR', 'de-DE'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-US';

/** Each language named in itself, so a person who cannot read the current one still finds theirs. */
export const LOCALE_NAMES: Record<Locale, string> = {
  'en-US': 'English (US)',
  'pt-BR': 'Português (Brasil)',
  'de-DE': 'Deutsch',
};

/** dayjs locale ids; the matching `dayjs/locale/*` files are imported by the i18n runtime. */
export const DAYJS_LOCALES: Record<Locale, string> = {
  'en-US': 'en',
  'pt-BR': 'pt-br',
  'de-DE': 'de',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
