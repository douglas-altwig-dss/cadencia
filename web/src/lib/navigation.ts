import {
  IconActivity,
  IconChartDots,
  IconLayoutDashboard,
  IconPresentation,
  IconSettings,
  IconTimeline,
  IconUsers,
} from '@tabler/icons-react';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof IconLayoutDashboard;
  match: (pathname: string) => boolean;
}

// Grouped by what the person is doing: following the work, delivering the report, or looking after
// the system. The groups only label; every destination is still one click away.
export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Acompanhar',
    items: [
      { to: '/', label: 'Painel', icon: IconLayoutDashboard, match: (p) => p === '/' || p.startsWith('/boards') || p.startsWith('/issues') },
      { to: '/fluxo', label: 'Fluxo', icon: IconChartDots, match: (p) => p.startsWith('/fluxo') },
      { to: '/pessoas', label: 'Pessoas', icon: IconUsers, match: (p) => p.startsWith('/pessoas') },
      { to: '/timeline-foco', label: 'Timeline de foco', icon: IconTimeline, match: (p) => p.startsWith('/timeline-foco') },
    ],
  },
  {
    section: 'Entregar',
    items: [{ to: '/apresentacao', label: 'Apresentação', icon: IconPresentation, match: (p) => p.startsWith('/apresentacao') }],
  },
  {
    section: 'Sistema',
    items: [
      { to: '/status', label: 'Status da coleta', icon: IconActivity, match: (p) => p.startsWith('/status') },
      { to: '/configuracao', label: 'Configuração', icon: IconSettings, match: (p) => p.startsWith('/configuracao') },
    ],
  },
];

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
  return [
    ...NAV.flatMap((group) => group.items.map((item) => ({ label: item.label, path: item.to }))),
    { label: 'Minha semana', path: myWeekPath() },
    { label: 'Saúde dos dados', path: '/status?tab=saude' },
    { label: 'Notificações', path: '/configuracao?tab=notificacoes' },
    { label: 'Primeiros passos', path: '/inicio' },
  ];
}
