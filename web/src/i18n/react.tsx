import { useQueryClient } from '@tanstack/react-query';
import { Fragment, createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import type { Locale } from './locales';
import type { Messages } from './locales/en-US';
import { applyLocale, catalogue, currentLocale, subscribeLocale } from './runtime';

type Context = { locale: Locale; messages: Messages; setLocale: (locale: Locale) => void };

const I18nContext = createContext<Context | null>(null);

/**
 * Holds the language for the tree below it. Must sit inside `QueryClientProvider`: a change resets
 * the query cache, because API responses carry translated text. The children are keyed by the
 * language, so a change remounts them and module-level helpers that call `t()` render again.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const locale = useSyncExternalStore(subscribeLocale, currentLocale, currentLocale);
  const setLocale = useCallback(
    (next: Locale) => {
      if (next === currentLocale()) return;
      applyLocale(next);
      void queryClient.resetQueries();
    },
    [queryClient],
  );
  const value = useMemo(() => ({ locale, messages: catalogue(locale), setLocale }), [locale, setLocale]);
  return (
    <I18nContext.Provider value={value}>
      <Fragment key={locale}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

function useI18n(): Context {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useT/useLocale need an <I18nProvider> above them');
  return value;
}

/** The current catalogue: `const t = useT(); t.people.title`. */
export function useT(): Messages {
  return useI18n().messages;
}

/** `[locale, setLocale]`; setting it persists the choice, resets the queries and remounts the app. */
export function useLocale(): [Locale, (locale: Locale) => void] {
  const { locale, setLocale } = useI18n();
  return [locale, setLocale];
}
