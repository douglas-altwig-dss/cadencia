import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';

import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { ApiError } from './api/client';
import { App } from './App';
import { DAYJS_LOCALES, I18nProvider, useLocale } from './i18n';
import { theme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors (4xx) are answers, not glitches: do not retry them.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

/** Mantine's date pickers speak the chosen language; the week starts on Monday in all of them. */
function LocalizedDates({ children }: { children: ReactNode }) {
  const [locale] = useLocale();
  return <DatesProvider settings={{ locale: DAYJS_LOCALES[locale], firstDayOfWeek: 1 }}>{children}</DatesProvider>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <LocalizedDates>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </LocalizedDates>
        </I18nProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
