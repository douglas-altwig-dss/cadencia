import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

// RF-34: every filter lives in the URL so any view can be shared as a link, and it is carried
// along when drilling down or going back (RF-31).
export const FILTER_KEYS = ['board', 'person', 'type', 'start', 'end', 'situation'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

/**
 * `path` with `query` merged into whatever query it already carries. A key the path names itself
 * wins, so a crumb's own `?tab=` is never replaced by a carried filter.
 */
export function linkWith(path: string, query: Record<string, string>): string {
  const url = new URL(path, 'http://local');
  const merged = new URLSearchParams(query);
  for (const [key, value] of url.searchParams) merged.set(key, value);
  const text = merged.toString();
  return `${url.pathname}${text ? `?${text}` : ''}${url.hash}`;
}

export function useFilters() {
  const [params, setParams] = useSearchParams();

  const get = useCallback((key: string) => params.get(key) ?? undefined, [params]);

  const set = useCallback(
    (patch: Record<string, string | null | undefined>) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === undefined || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  /** Link to another view keeping the shared filters (not view-local keys such as `tab`). */
  const carry = useCallback(
    (path: string, extra: Record<string, string | undefined> = {}) => {
      const keep: Record<string, string> = {};
      for (const key of FILTER_KEYS) {
        const value = params.get(key);
        if (value) keep[key] = value;
      }
      for (const [key, value] of Object.entries(extra)) if (value) keep[key] = value;
      return linkWith(path, keep);
    },
    [params],
  );

  return { params, get, set, carry };
}
