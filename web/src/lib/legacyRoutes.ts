/**
 * Every web-app URL is English (docs/routes.md), and some pages moved after that (the October 2026
 * restructure: spaces, a stable board page, epics off the board, the Presentation split, one setup).
 * The old URLs keep working because bookmarks, saved views, e-mails and shared deck links already
 * carry them: this module maps an old path, an old query key or an old `?tab=` value to the URL that
 * replaced it, and the router redirects (`replace`) whenever it answers. Pure, so every pair is
 * pinned by a test.
 */

interface PathRename {
  from: readonly string[];
  to: readonly string[];
  /** Only the path itself, never a sub-path (a page that moved, not a tree). */
  exact?: boolean;
  /** Query values the new page needs to land where the old one did. */
  query?: Readonly<Record<string, string>>;
}

/** Old leading path segments → new ones. Longest first, so a sub-path wins over its parent. */
const PATHS: readonly PathRename[] = [
  { from: ['configuracao', 'assistente'], to: ['setup'], query: { phase: 'configure' } },
  { from: ['settings', 'wizard'], to: ['setup'], query: { phase: 'configure' } },
  { from: ['apresentar', 'plateia'], to: ['present', 'audience'] },
  { from: ['inicio'], to: ['setup'], exact: true },
  { from: ['getting-started'], to: ['setup'], exact: true },
  { from: ['minha-semana'], to: ['me'], exact: true },
  { from: ['my-week'], to: ['me'], exact: true },
  { from: ['timeline-foco'], to: ['people', 'focus'], exact: true },
  { from: ['focus-timeline'], to: ['people', 'focus'], exact: true },
  { from: ['pessoas'], to: ['people'] },
  { from: ['apresentacao'], to: ['presentation'] },
  { from: ['configuracao'], to: ['settings'] },
  { from: ['compartilhado'], to: ['shared'] },
];

/** The flow metrics' old homes: a page of their own, then a section of the board list. */
const FLOW_PAGES = new Set(['flow', 'fluxo']);
const FLOW_ANCHOR = '#flow';

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
 * segment). Per screen because the same word can mean a different tab elsewhere.
 */
export const LEGACY_TABS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '/people': { 'minha-semana': 'my-week' },
  '/people/:accountId': { semana: 'week', capacidade: 'capacity', historico: 'history', funcao: 'role' },
  '/boards/:boardId': { visao: 'overview', arvore: 'work-tree', riscos: 'risks', fluxo: 'flow', mudancas: 'changes', saude: 'hygiene' },
  '/boards/:boardId/sprints/:sprintId': {
    visao: 'overview',
    arvore: 'work-tree',
    riscos: 'risks',
    mudancas: 'changes',
    compromisso: 'commitment',
    // The sprint's "planned × actual" is an allocation, not the epic's plan.
    planejamento: 'allocation',
    planning: 'allocation',
  },
  '/epics/:epicKey': { visao: 'overview', plano: 'plan' },
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

/** A single board id, the only `board` value a board's own page can stand for. */
const singleBoard = (value: string | null) => (value && /^\d+$/.test(value) ? value : null);

/**
 * The current URL (path, `?search` and `#hash`) an old one stands for, or `null` when nothing in it
 * is old — so a current URL never redirects, and an unknown value is left for the page to handle as
 * it always has. The hash is carried unless the old URL used it to name a section that is now a
 * page of its own.
 */
export function normalizeLegacyUrl(pathname: string, search: string, hash = ''): string | null {
  let changed = false;
  let segments = segmentsOf(pathname);
  const trailing = pathname.length > 1 && pathname.endsWith('/');

  const original = new URLSearchParams(search);
  let params = new URLSearchParams();
  for (const [key, value] of original) {
    const renamed = LEGACY_QUERY_KEYS[key];
    if (renamed) {
      changed = true;
      // A current key already in the URL wins over its old spelling.
      if (!original.has(renamed)) params.append(renamed, value);
    } else {
      params.append(key, value);
    }
  }

  // The flow metrics live on a board's (and a space's) own page now. With one board named, they
  // land on it; otherwise on the board list, which leads to every board.
  const flow = (segments.length === 1 && FLOW_PAGES.has(segments[0])) || (segments.length === 1 && segments[0] === 'boards' && hash === FLOW_ANCHOR);
  if (flow) {
    const board = singleBoard(params.get('board'));
    segments = board ? ['boards', board] : ['boards'];
    if (board) {
      params.delete('board');
      params.set('tab', 'flow');
    }
    hash = '';
    changed = true;
  }

  for (const rename of flow ? [] : PATHS) {
    const { from, to, exact, query } = rename;
    if ((exact ? segments.length === from.length : true) && from.every((part, i) => segments[i] === part)) {
      segments = [...to, ...segments.slice(from.length)];
      for (const [key, value] of Object.entries(query ?? {})) if (!params.has(key)) params.set(key, value);
      changed = true;
      break;
    }
  }

  // Absences were a Settings tab before they moved to People, where they open as a drawer.
  if (segments.length === 1 && segments[0] === 'settings' && params.get('tab') === 'ausencias') {
    segments = ['people'];
    params.delete('tab');
    params.set('absences', '1');
    changed = true;
  }

  // An epic spans boards, so it left the board's path; the board it was opened from is a filter.
  if (segments.length === 4 && segments[0] === 'boards' && segments[2] === 'epics') {
    const [, board, , key] = segments;
    segments = ['epics', key];
    if (!params.has('board')) params.set('board', board);
    changed = true;
  }

  // The template editor is a page of its own; `?template=` used to open it inside the gallery.
  if (segments.length === 1 && segments[0] === 'presentation' && params.get('template')) {
    segments = ['presentation', 'templates', params.get('template')!];
    params.delete('template');
    changed = true;
  }

  const tab = params.get('tab');
  const renamedTab = tab === null ? undefined : tabsFor(segments)?.[tab];
  if (renamedTab) {
    params = new URLSearchParams([...params].map(([key, value]) => [key, key === 'tab' ? renamedTab : value]));
    changed = true;
  }

  // A board's profile is a setting of that board: it moved to the board's own Settings tab.
  if (segments.length === 1 && segments[0] === 'settings' && params.get('tab') === 'profile') {
    const board = singleBoard(params.get('profile'));
    params.delete('profile');
    if (board) {
      segments = ['boards', board];
      params.set('tab', 'settings');
    } else {
      params.set('tab', 'boards');
    }
    changed = true;
  }

  if (!changed) return null;
  const path = `/${segments.join('/')}${trailing && segments.length ? '/' : ''}`;
  const query = params.toString();
  // Untouched, the query is kept byte for byte rather than re-encoded.
  const kept = query === new URLSearchParams(search).toString() ? search.replace(/^\?/, '') : query;
  return `${path}${kept ? `?${kept}` : ''}${hash}`;
}
