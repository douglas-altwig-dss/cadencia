import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { t } from '../i18n';
import { defaultMosaic, normalize, type LegacyLayout, type Mosaic } from '../lib/mosaic';
import { api } from './client';
import type { HomeLayoutResponse, Pulse } from './types';

const LAYOUT = ['home-layout'] as const;
const LEGACY_KEY = 'cadencia-painel-layout';
/** How long to wait after the last change before saving: a drag or three size clicks are one save. */
const SAVE_AFTER_MS = 500;

export const usePulse = () => useQuery({ queryKey: ['home-pulse'], queryFn: () => api.get<Pulse>('/home/pulse'), staleTime: 60_000 });

/** The layout kept before the mosaic existed (RF-97), read once so nobody loses what they had hidden. */
function readLegacy(): LegacyLayout | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    return raw ? (JSON.parse(raw) as LegacyLayout) : null;
  } catch {
    return null;
  }
}

/**
 * The Home mosaic, kept in Cadência's own database per signed-in user (nothing is ever written to
 * Jira). Until somebody arranges it there is nothing stored and the default is shown; the first
 * change saves. Changes show at once and are sent after a short pause.
 */
export function useMosaic() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: LAYOUT, queryFn: () => api.get<HomeLayoutResponse>('/home/layout'), staleTime: Infinity });
  const stored = normalize(query.data?.layout);
  const mosaic: Mosaic = stored ?? defaultMosaic(readLegacy());

  const put = useMutation({
    mutationFn: (next: Mosaic) => api.put<HomeLayoutResponse>('/home/layout', next),
    onError: (error: Error) => {
      notifications.show({ color: 'red', title: t().shell.api.homeNotSaved, message: error.message });
      void client.invalidateQueries({ queryKey: LAYOUT });
    },
  });
  const pending = useRef<Mosaic | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pending.current) {
      put.mutate(pending.current);
      pending.current = null;
    }
    // `put` is stable enough for this: mutate does not change identity meaningfully between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (next: Mosaic) => {
      client.setQueryData<HomeLayoutResponse>(LAYOUT, (previous) => ({
        user: previous?.user ?? null,
        shared: previous?.shared ?? true,
        layout: next,
      }));
      pending.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_AFTER_MS);
    },
    [client, flush],
  );

  // Leaving the page must not lose the last change.
  useEffect(() => flush, [flush]);

  const reset = useCallback(async () => {
    window.clearTimeout(timer.current);
    pending.current = null;
    await api.del<void>('/home/layout');
    try {
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* private mode: nothing to clear */
    }
    client.setQueryData<HomeLayoutResponse>(LAYOUT, (previous) => ({ user: previous?.user ?? null, shared: previous?.shared ?? true, layout: null }));
  }, [client]);

  return {
    mosaic,
    isLoading: query.isLoading,
    saving: put.isPending,
    shared: query.data?.shared ?? false,
    customised: stored !== null,
    update,
    reset,
  };
}
