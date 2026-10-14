import {
  IconActivity,
  IconHierarchy2,
  IconLayoutDashboard,
  IconLayoutKanban,
  IconPresentation,
  IconSettings,
  IconTimeline,
  IconUsers,
} from '@tabler/icons-react';

import { t } from '../i18n';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof IconLayoutDashboard;
  match: (pathname: string) => boolean;
}

// Grouped by what the person is doing: following the work, delivering the report, or looking after
// the system. The groups only label; every destination is still one click away. Built when asked
// for, so the words follow the current language.
export function nav(): { section: string; items: NavItem[] }[] {
  const w = t().shell.nav;
  return [
    {
      section: w.follow,
      items: [
        { to: '/', label: w.home, icon: IconLayoutDashboard, match: (p) => p === '/' || p.startsWith('/issues') },
        // Home → Space → Board → Sprint: a team's page, then its boards. Epics hang off the boards.
        { to: '/spaces', label: w.spaces, icon: IconHierarchy2, match: (p) => p.startsWith('/spaces') },
        { to: '/boards', label: w.boards, icon: IconLayoutKanban, match: (p) => p.startsWith('/boards') || p.startsWith('/epics') },
        { to: '/people', label: w.people, icon: IconUsers, match: (p) => (p.startsWith('/people') && !p.startsWith('/people/focus')) || p === '/me' },
        // The focus log is the team's own record of what people worked on, so it lives under People.
        { to: '/people/focus', label: w.focusTimeline, icon: IconTimeline, match: (p) => p.startsWith('/people/focus') },
      ],
    },
    {
      section: w.deliver,
      items: [{ to: '/presentation', label: w.presentation, icon: IconPresentation, match: (p) => p.startsWith('/presentation') }],
    },
    {
      section: w.system,
      items: [
        { to: '/status', label: w.collectionStatus, icon: IconActivity, match: (p) => p.startsWith('/status') },
        { to: '/settings', label: w.settings, icon: IconSettings, match: (p) => p.startsWith('/settings') || p.startsWith('/setup') },
      ],
    },
  ];
}

/**
 * M19: "Minha semana" opens the person picked on the People page, not the picker, when one is
 * remembered. `/me` is the stable link to it; this is where `/me` lands.
 */
export function myWeekPath(): string {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem('cadencia-minha-pessoa') ?? 'null');
    if (typeof stored === 'string' && stored) return `/people/${encodeURIComponent(stored)}?tab=week`;
  } catch {
    // Unreadable storage: the picker is the honest answer.
  }
  return '/people?tab=my-week';
}

/** Every destination the command palette offers as a page: the navigation itself, then the screens beside it. */
export function palettePages(): { label: string; path: string }[] {
  const w = t().shell.nav;
  return [
    ...nav().flatMap((group) => group.items.map((item) => ({ label: item.label, path: item.to }))),
    { label: w.myWeek, path: '/me' },
    { label: w.dataHygiene, path: '/status?tab=health' },
    { label: w.notifications, path: '/settings?tab=notifications' },
    { label: w.generations, path: '/presentation/runs' },
    { label: w.variables, path: '/presentation/variables' },
    { label: w.gettingStarted, path: '/setup' },
  ];
}
