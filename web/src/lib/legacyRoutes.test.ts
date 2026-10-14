import { describe, expect, it } from 'vitest';

import { LEGACY_TABS, normalizeLegacyUrl } from './legacyRoutes';

const go = (url: string) => {
  const [rest, hash] = url.split('#');
  const [path, query] = rest.split('?');
  return normalizeLegacyUrl(path, query ? `?${query}` : '', hash ? `#${hash}` : '');
};

describe('normalizeLegacyUrl: paths', () => {
  it.each([
    ['/inicio', '/setup'],
    ['/getting-started', '/setup'],
    ['/pessoas', '/people'],
    ['/pessoas/abc-123', '/people/abc-123'],
    ['/apresentacao', '/presentation'],
    ['/apresentar/plateia', '/present/audience'],
    ['/timeline-foco', '/people/focus'],
    ['/focus-timeline', '/people/focus'],
    ['/configuracao', '/settings'],
    ['/configuracao/assistente', '/setup?phase=configure'],
    ['/settings/wizard', '/setup?phase=configure'],
    ['/minha-semana', '/me'],
    ['/my-week', '/me'],
    ['/compartilhado/tok_EN-123', '/shared/tok_EN-123'],
  ])('%s → %s', (from, to) => {
    expect(go(from)).toBe(to);
  });

  it('keeps the filters of a page that moved', () => {
    expect(go('/minha-semana?board=3')).toBe('/me?board=3');
    expect(go('/settings/wizard?phase=first-run')).toBe('/setup?phase=first-run');
  });

  it('keeps a trailing slash', () => {
    expect(go('/pessoas/')).toBe('/people/');
  });

  it('only matches whole segments', () => {
    expect(go('/pessoasx')).toBeNull();
    expect(go('/fluxograma')).toBeNull();
    expect(go('/boards/1/fluxo')).toBeNull();
    expect(go('/boards/1/flow')).toBeNull();
    expect(go('/flowx')).toBeNull();
    // Only the page itself moved: a sub-path was never a page.
    expect(go('/my-week/x')).toBeNull();
    expect(go('/getting-started/x')).toBeNull();
  });

  it('sends the flow metrics to the one board they were about, or to the board list', () => {
    expect(go('/flow?board=4')).toBe('/boards/4?tab=flow');
    expect(go('/fluxo?board=4&type=Bug')).toBe('/boards/4?type=Bug&tab=flow');
    expect(go('/flow')).toBe('/boards');
    expect(go('/flow?board=1,2&type=Bug')).toBe('/boards?board=1,2&type=Bug');
    // The previous redirect's target: a section of the board list.
    expect(go('/boards?board=4#flow')).toBe('/boards/4?tab=flow');
    expect(go('/boards#flow')).toBe('/boards');
    expect(go('/flow/x')).toBeNull();
    expect(go('/fluxo/x')).toBeNull();
  });

  it('takes an epic off its board, keeping the board as a filter', () => {
    expect(go('/boards/1/epics/CAD-1')).toBe('/epics/CAD-1?board=1');
    expect(go('/boards/1/epics/CAD-1?tab=plano&sprint=9')).toBe('/epics/CAD-1?tab=plan&sprint=9&board=1');
    expect(go('/boards/1/epics/CAD-1?board=2')).toBe('/epics/CAD-1?board=2');
  });

  it('opens a template at its own page', () => {
    expect(go('/presentation?template=3')).toBe('/presentation/templates/3');
    expect(go('/apresentacao?modelo=3&run=r1&forma=sh4')).toBe('/presentation/templates/3?run=r1&shape=sh4');
    expect(go('/presentation?template=3&wizard=1')).toBe('/presentation/templates/3?wizard=1');
  });

  it('sends a board profile to the board it configures', () => {
    expect(go('/settings?tab=profile&profile=12')).toBe('/boards/12?tab=settings');
    expect(go('/configuracao?tab=perfil&perfil=12')).toBe('/boards/12?tab=settings');
    expect(go('/settings?tab=profile')).toBe('/settings?tab=boards');
  });

  it('leaves /apresentar without the audience segment alone', () => {
    expect(go('/apresentar')).toBeNull();
  });

  it('carries the hash of a page that only moved', () => {
    expect(go('/pessoas#top')).toBe('/people#top');
  });
});

describe('normalizeLegacyUrl: tabs', () => {
  it('translates the person page tabs', () => {
    expect(go('/pessoas/abc?tab=semana')).toBe('/people/abc?tab=week');
    expect(go('/people/abc?tab=capacidade')).toBe('/people/abc?tab=capacity');
    expect(go('/people/abc?tab=historico')).toBe('/people/abc?tab=history');
    expect(go('/people/abc?tab=funcao')).toBe('/people/abc?tab=role');
    expect(go('/people/abc?tab=timeline')).toBeNull();
  });

  it('translates the People list tab', () => {
    expect(go('/pessoas?tab=minha-semana')).toBe('/people?tab=my-week');
    // `semana` was never a tab of the list: it is left for the page, which ignores it.
    expect(go('/pessoas?tab=semana')).toBe('/people?tab=semana');
  });

  it('translates the Settings sections', () => {
    expect(go('/configuracao?tab=campos')).toBe('/settings?tab=fields');
    expect(go('/settings?tab=conexao')).toBe('/settings?tab=connection');
    expect(go('/settings?tab=plano-epico')).toBe('/settings?tab=epic-plan');
    expect(go('/settings?tab=notificacoes')).toBe('/settings?tab=notifications');
    expect(go('/settings?tab=email')).toBeNull();
    expect(go('/settings?tab=boards&board=4')).toBeNull();
  });

  it('sends the old absences tab to the People drawer', () => {
    expect(go('/configuracao?tab=ausencias')).toBe('/people?absences=1');
    expect(go('/settings?tab=ausencias')).toBe('/people?absences=1');
  });

  it('translates board, sprint, epic and status tabs per screen', () => {
    expect(go('/boards/1?tab=arvore')).toBe('/boards/1?tab=work-tree');
    expect(go('/boards/1?tab=fluxo')).toBe('/boards/1?tab=flow');
    expect(go('/boards/1/sprints/9?tab=compromisso')).toBe('/boards/1/sprints/9?tab=commitment');
    expect(go('/boards/1/sprints/9?tab=planejamento')).toBe('/boards/1/sprints/9?tab=allocation');
    expect(go('/boards/1/sprints/9?tab=planning')).toBe('/boards/1/sprints/9?tab=allocation');
    expect(go('/epics/CAD-1?tab=plano')).toBe('/epics/CAD-1?tab=plan');
    expect(go('/status?tab=saude')).toBe('/status?tab=health');
    expect(go('/status?tab=coleta')).toBe('/status?tab=collection');
  });

  it('maps the same word differently per screen', () => {
    // `coleta` is the Status tab and a Settings section; `fluxo` is a board tab only.
    expect(go('/configuracao?tab=coleta')).toBe('/settings?tab=collection');
    expect(go('/boards/1/sprints/9?tab=fluxo')).toBeNull();
    expect(go('/pessoas/abc?tab=fluxo')).toBe('/people/abc?tab=fluxo');
    expect(go('/epics/CAD-1?tab=planejamento')).toBeNull();
  });

  it('leaves unknown values alone', () => {
    expect(go('/boards/1?tab=nada')).toBeNull();
    expect(go('/status?tab=whatever')).toBeNull();
    expect(go('/issues/CAD-1?tab=visao')).toBeNull();
  });

  it('has a translation table only for current screens', () => {
    for (const pattern of Object.keys(LEGACY_TABS)) expect(go(pattern.replace(/:[a-zA-Z]+/g, 'x'))).toBeNull();
  });
});

describe('normalizeLegacyUrl: query keys', () => {
  it('renames the deck editor keys', () => {
    expect(go('/presentation/templates/3?assistente=1')).toBe('/presentation/templates/3?wizard=1');
    expect(go('/presentation/templates/3?slide=256&forma=sh4')).toBe('/presentation/templates/3?slide=256&shape=sh4');
  });

  it('renames the People drawers and the audience channel', () => {
    expect(go('/pessoas?funcoes=1')).toBe('/people?roles=1');
    expect(go('/people?ausencias=1')).toBe('/people?absences=1');
    expect(go('/apresentar/plateia?canal=a%20b')).toBe('/present/audience?channel=a+b');
  });

  it('lets a current key win over its old spelling', () => {
    expect(go('/presentation?modelo=1&template=2')).toBe('/presentation/templates/2');
  });
});

describe('normalizeLegacyUrl: what it keeps', () => {
  it('keeps the shared filters', () => {
    expect(go('/fluxo?board=1&type=Story&start=2026-09-01&end=2026-09-30')).toBe(
      '/boards/1?type=Story&start=2026-09-01&end=2026-09-30&tab=flow',
    );
    expect(go('/boards/1/sprints/9?tab=riscos&situation=bloqueado&person=abc')).toBe(
      '/boards/1/sprints/9?tab=risks&situation=bloqueado&person=abc',
    );
  });

  it('answers null for current URLs', () => {
    for (const url of [
      '/',
      '/boards?board=1',
      '/boards?kind=kanban',
      '/boards/1?tab=settings',
      '/spaces',
      '/spaces/CAD?tab=flow',
      '/epics/CAD-1?board=1',
      '/people',
      '/people/abc?tab=week',
      '/people/focus',
      '/people?tab=my-week&absences=1',
      '/me',
      '/presentation',
      '/presentation/templates/3?wizard=1',
      '/presentation/runs/r1',
      '/presentation/variables?template=3',
      '/present/audience?channel=x',
      '/settings?tab=fields',
      '/setup?phase=configure',
      '/shared/tok',
      '/boards/1/sprints/9?tab=work-tree',
      '/issues/CAD-1',
      '/status?tab=health',
    ]) {
      expect(go(url), url).toBeNull();
    }
  });

  it('does not re-encode a query it did not touch', () => {
    expect(go('/flow?type=User%20Story')).toBe('/boards?type=User%20Story');
  });
});
