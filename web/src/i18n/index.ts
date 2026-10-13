// The i18n entry point (docs/i18n.md). Components: `const t = useT(); t.shell.preferences.theme`.
// Outside React: `t().common.never`, called at use time.

export { I18nProvider, useLocale, useT } from './react';
export { DAYJS_LOCALES, DEFAULT_LOCALE, LOCALES, LOCALE_NAMES, isLocale, type Locale } from './locales';
export type { Messages } from './locales/en-US';
export { plural } from './plural';
export { collator, currentLocale, setLocaleForTests, t } from './runtime';
