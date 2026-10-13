import {
  IconActivity,
  IconChartDots,
  IconLayoutDashboard,
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
        { to: '/', label: w.home, icon: IconLayoutDashboard, match: (p) => p === '/' || p.startsWith('/boards') || p.startsWith('/issues') },
        { to: '/fluxo', label: w.flow, icon: IconChartDots, match: (p) => p.startsWith('/fluxo') },
        { to: '/pessoas', label: w.people, icon: IconUsers, match: (p) => p.startsWith('/pessoas') },
        { to: '/timeline-foco', label: w.focusTimeline, icon: IconTimeline, match: (p) => p.startsWith('/timeline-foco') },
      ],
    },
    {
      section: w.deliver,
      items: [{ to: '/apresentacao', label: w.presentation, icon: IconPresentation, match: (p) => p.startsWith('/apresentacao') }],
    },
    {
      section: w.system,
      items: [
        { to: '/status', label: w.collectionStatus, icon: IconActivity, match: (p) => p.startsWith('/status') },
        { to: '/configuracao', label: w.settings, icon: IconSettings, match: (p) => p.startsWith('/configuracao') },
      ],
    },
  ];
}

/** M19: "Minha semana" opens the person picked on the People page, not the picker, when one is remembered. */
export function myWeekPath(): string {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem('cadencia-minha-pessoa') ?? 'null');
    if (typeof stored === 'string' && stored) return `/pessoas/${encodeURIComponent(stored)}?tab=semana`;
  } catch {
    // Unreadable storage: the picker is the honest answer.
  }
  return '/pessoas?tab=minha-semana';
}

/** Every destination the command palette offers as a page: the navigation itself, then the screens beside it. */
export function palettePages(): { label: string; path: string }[] {
  const w = t().shell.nav;
  return [
    ...nav().flatMap((group) => group.items.map((item) => ({ label: item.label, path: item.to }))),
    { label: w.myWeek, path: myWeekPath() },
    { label: w.dataHygiene, path: '/status?tab=saude' },
    { label: w.notifications, path: '/configuracao?tab=notificacoes' },
    { label: w.gettingStarted, path: '/inicio' },
  ];
}
