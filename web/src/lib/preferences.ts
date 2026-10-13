import { useLocalStorage } from '@mantine/hooks';
import { useEffect } from 'react';

/**
 * Display preferences, per browser (RF-95, RF-96, RF-98). They are about how one person reads the
 * screen — denser tables, patterns on charts, less motion — so they never travel to the server.
 */
export interface Preferences {
  /** RF-98: compact rows fit a long risk list on one screen. */
  density: 'confortavel' | 'compacta';
  /** RF-96: patterns on chart areas and bars, so series never depend on colour alone. */
  chartPatterns: boolean;
  /** RF-95: no transitions or animations, whatever the operating system says. */
  reduceMotion: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { density: 'confortavel', chartPatterns: false, reduceMotion: false };

export function usePreferences() {
  const [stored, setStored] = useLocalStorage<Preferences>({
    key: 'cadencia-preferencias',
    defaultValue: DEFAULT_PREFERENCES,
    getInitialValueInEffect: false,
  });
  const preferences = { ...DEFAULT_PREFERENCES, ...stored };
  const set = (patch: Partial<Preferences>) => setStored((previous) => ({ ...DEFAULT_PREFERENCES, ...previous, ...patch }));
  return [preferences, set] as const;
}

/** Mirrors the preferences onto <html>, where the stylesheet reads them. */
export function useApplyPreferences() {
  const [preferences] = usePreferences();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = preferences.density;
    root.dataset.motion = preferences.reduceMotion ? 'reduzido' : 'normal';
  }, [preferences.density, preferences.reduceMotion]);
}
