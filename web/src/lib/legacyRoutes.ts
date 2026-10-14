/**
 * Every web-app URL is English (docs/routes.md). The Portuguese ones keep working because
 * bookmarks, saved views, e-mails and shared deck links already carry them: this module maps an old
 * path, an old query key or an old `?tab=` value to the URL that replaced it, and the router
 * redirects (`replace`) whenever it answers. Pure, so every pair is pinned by a test.
 */

/** Old leading path segments → new ones. Longest first, so a sub-path wins over its parent. */
const PATHS: readonly (readonly [readonly string[], readonly string[]])[] = [
  [['configuracao', 'assistente'], ['settings', 'wizard']],
  [['apresentar', 'plateia'], ['present', 'audience']],
  [['inicio'], ['getting-started']],
  [['fluxo'], ['flow']],
  [['pessoas'], ['people']],
  [['apresentacao'], ['presentation']],
  [['timeline-foco'], ['focus-timeline']],
  [['configuracao'], ['settings']],
  [['compartilhado'], ['shared']],
];

/** Old query keys → new ones, on any screen. */
export const LEGACY_QUERY_KEYS: Readonly<Record<string, string>> = {
  modelo: 'template',
  forma: 'shape',
  assistente: 'wizard',
  ausencias: 'absences',
  funcoes: 'roles',
  perfil: 'profile',
  canal: 'channel',
};

/**
 * Old `?tab=` values per screen, keyed by the screen's *new* path pattern (`:x` is any one
 * segment). Per screen because the same Portuguese word can mean a different tab elsewhere.
 */
export const LEGACY_TABS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '/people': { 'minha-semana': 'my-week' },
  '/people/:accountId': { semana: 'week', capacidade: 'capacity', historico: 'history', funcao: 'role' },
  '/boards/:boardId': { visao: 'overview', arvore: 'work-tree', riscos: 'risks', fluxo: 'flow', mudancas: 'changes' },
  '/boards/:boardId/sprints/:sprintId': {
    visao: 'overview',
    arvore: 'work-tree',
    riscos: 'risks',
    mudancas: 'changes',
    compromisso: 'commitment',
    planejamento: 'planning',
  },
  '/boards/:boardId/epics/:epicKey': { visao: 'overview', plano: 'plan' },
  '/status': { coleta: 'collection', saude: 'health' },
  '/settings': {
    conexao: 'connection',
    calendario: 'calendar',
    coleta: 'collection',
    ia: 'ai',
    geral: 'general',
    campos: 'fields',
    perfil: 'profile',
    notificacoes: 'notifications',
    'plano-epico': 'epic-plan',
  },
};

const segmentsOf = (pathname: string) => pathname.split('/').filter(Boolean);

function matches(pattern: string, segments: readonly string[]): boolean {
  const parts = segmentsOf(pattern);
  return parts.length === segments.length && parts.every((part, i) => part.startsWith(':') || part === segments[i]);
}

function tabsFor(segments: readonly string[]): Readonly<Record<string, string>> | undefined {
  for (const [pattern, tabs] of Object.entries(LEGACY_TABS)) if (matches(pattern, segments)) return tabs;
  return undefined;
}

/**
 * The English URL (path plus `?search`) an old one stands for, or `null` when nothing in it is old —
 * so an English URL never redirects, and an unknown value is left for the page to handle as it
 * always has.
 */
export function normalizeLegacyUrl(pathname: string, search: string): string | null {
  let pathChanged = false;
  let queryChanged = false;
  let segments = segmentsOf(pathname);
  const trailing = pathname.length > 1 && pathname.endsWith('/');
  for (const [from, to] of PATHS) {
    if (from.every((part, i) => segments[i] === part)) {
      segments = [...to, ...segments.slice(from.length)];
      pathChanged = true;
      break;
    }
  }

  const original = new URLSearchParams(search);
  let params = new URLSearchParams();
  for (const [key, value] of original) {
    const renamed = LEGACY_QUERY_KEYS[key];
    if (renamed) {
      queryChanged = true;
      // An English key already in the URL wins over its old spelling.
      if (!original.has(renamed)) params.append(renamed, value);
    } else {
      params.append(key, value);
    }
  }

  // "Minha semana" was its own page, then a tab of Pessoas.
  if (segments.length === 1 && segments[0] === 'minha-semana') {
    segments = ['people'];
    params.set('tab', 'my-week');
    pathChanged = queryChanged = true;
  }

  // Absences were a Settings tab before they moved to Pessoas, where they open as a drawer.
  if (segments.length === 1 && segments[0] === 'settings' && params.get('tab') === 'ausencias') {
    segments = ['people'];
    params.delete('tab');
    params.set('absences', '1');
    pathChanged = queryChanged = true;
  }

  const tab = params.get('tab');
  const renamedTab = tab === null ? undefined : tabsFor(segments)?.[tab];
  if (renamedTab) {
    params = new URLSearchParams([...params].map(([key, value]) => [key, key === 'tab' ? renamedTab : value]));
    queryChanged = true;
  }

  if (!pathChanged && !queryChanged) return null;
  const path = pathChanged ? `/${segments.join('/')}${trailing && segments.length ? '/' : ''}` : pathname;
  // Untouched, the query is kept byte for byte rather than re-encoded.
  const query = queryChanged ? params.toString() : search.replace(/^\?/, '');
  return `${path}${query ? `?${query}` : ''}`;
}
