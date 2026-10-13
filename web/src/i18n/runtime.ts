// The current language, outside React. Lib code reads it at call time (`t()`, `currentLocale()`),
// never at module load, so a change of language reaches it on the next render.

import 'dayjs/locale/de';
import 'dayjs/locale/pt-br';

import dayjs from 'dayjs';

import { DAYJS_LOCALES, DEFAULT_LOCALE, isLocale, type Locale } from './locales';
import { deDE } from './locales/de-DE';
import { enUS, type Messages } from './locales/en-US';
import { ptBR } from './locales/pt-BR';

/** Where the choice is kept, per browser (docs/i18n.md). */
export const STORAGE_KEY = 'cadencia-locale';

const CATALOGUES: Record<Locale, Messages> = { 'en-US': enUS, 'pt-BR': ptBR, 'de-DE': deDE };

/** A stored value, or the default when there is none or it is not a language we speak. */
export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

function readStored(): Locale {
  try {
    return parseLocale(globalThis.localStorage?.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

function writeStored(locale: Locale) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, locale);
  } catch {
    /* private window or blocked storage: the choice lasts until the page is reloaded */
  }
}

/** Everything outside React that follows the language: the page's `lang` and dayjs. */
function applyToEnvironment(locale: Locale) {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  dayjs.locale(DAYJS_LOCALES[locale]);
}

let current: Locale = readStored();
applyToEnvironment(current);

const listeners = new Set<() => void>();

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentLocale(): Locale {
  return current;
}

/** The current catalogue, read at call time: `t().common.never`. */
export function t(): Messages {
  return CATALOGUES[current];
}

/** The catalogue of a given language (for the provider and tests). */
export function catalogue(locale: Locale): Messages {
  return CATALOGUES[locale];
}

/**
 * Switch the language: remember it, update `<html lang>` and dayjs, and tell subscribers. React
 * code goes through `useLocale()`, which also resets the query cache and remounts the app.
 */
export function applyLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  writeStored(locale);
  applyToEnvironment(locale);
  for (const listener of [...listeners]) listener();
}

/** Tests only: switch the language without touching storage. Returns the previous one. */
export function setLocaleForTests(locale: Locale): Locale {
  const previous = current;
  current = locale;
  applyToEnvironment(locale);
  for (const listener of [...listeners]) listener();
  return previous;
}

const collators = new Map<Locale, Intl.Collator>();

/** A cached `Intl.Collator` for the current language: `names.sort(collator().compare)`. */
export function collator(): Intl.Collator {
  let value = collators.get(current);
  if (!value) {
    value = new Intl.Collator(current);
    collators.set(current, value);
  }
  return value;
}
