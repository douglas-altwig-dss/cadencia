import { describe, expect, it } from 'vitest';

import { LEGACY_TABS, normalizeLegacyUrl } from './legacyRoutes';

const go = (url: string) => {
  const [path, query] = url.split('?');
  return normalizeLegacyUrl(path, query ? `?${query}` : '');
};

describe('normalizeLegacyUrl: paths', () => {
  it.each([
    ['/inicio', '/getting-started'],
    ['/fluxo', '/flow'],
    ['/pessoas', '/people'],
    ['/pessoas/abc-123', '/people/abc-123'],
    ['/apresentacao', '/presentation'],
    ['/apresentar/plateia', '/present/audience'],
    ['/timeline-foco', '/focus-timeline'],
    ['/configuracao', '/settings'],
    ['/configuracao/assistente', '/settings/wizard'],
    ['/compartilhado/tok_EN-123', '/shared/tok_EN-123'],
  ])('%s → %s', (from, to) => {
    expect(go(from)).toBe(to);
  });

  it('turns /minha-semana into the People tab it became', () => {
    expect(go('/minha-semana')).toBe('/people?tab=my-week');
    expect(go('/minha-semana?board=3')).toBe('/people?board=3&tab=my-week');
  });

  it('keeps a trailing slash', () => {
    expect(go('/pessoas/')).toBe('/people/');
  });

  it('only matches whole segments', () => {
    expect(go('/pessoasx')).toBeNull();
    expect(go('/fluxograma')).toBeNull();
    expect(go('/boards/1/fluxo')).toBeNull();
  });

  it('leaves /apresentar without the audience segment alone', () => {
    expect(go('/apresentar')).toBeNull();
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
    expect(go('/boards/1/sprints/9?tab=planejamento')).toBe('/boards/1/sprints/9?tab=planning');
    expect(go('/boards/1/epics/CAD-1?tab=plano&sprint=9')).toBe('/boards/1/epics/CAD-1?tab=plan&sprint=9');
    expect(go('/status?tab=saude')).toBe('/status?tab=health');
    expect(go('/status?tab=coleta')).toBe('/status?tab=collection');
  });

  it('maps the same word differently per screen', () => {
    // `coleta` is the Status tab and a Settings section; `fluxo` is a board tab only.
    expect(go('/configuracao?tab=coleta')).toBe('/settings?tab=collection');
    expect(go('/boards/1/sprints/9?tab=fluxo')).toBeNull();
    expect(go('/pessoas/abc?tab=fluxo')).toBe('/people/abc?tab=fluxo');
    expect(go('/boards/1/epics/CAD-1?tab=planejamento')).toBeNull();
  });

  it('leaves unknown values alone', () => {
    expect(go('/boards/1?tab=nada')).toBeNull();
    expect(go('/status?tab=whatever')).toBeNull();
    expect(go('/issues/CAD-1?tab=visao')).toBeNull();
  });

  it('has a translation table only for English screens', () => {
    for (const pattern of Object.keys(LEGACY_TABS)) expect(go(pattern.replace(/:[a-zA-Z]+/g, 'x'))).toBeNull();
  });
});

describe('normalizeLegacyUrl: query keys', () => {
  it('renames the deck editor keys', () => {
    expect(go('/apresentacao?modelo=3&assistente=1')).toBe('/presentation?template=3&wizard=1');
    expect(go('/presentation?modelo=3&slide=256&forma=sh4')).toBe('/presentation?template=3&slide=256&shape=sh4');
  });

  it('renames the People drawers, the board profile and the audience channel', () => {
    expect(go('/pessoas?funcoes=1')).toBe('/people?roles=1');
    expect(go('/people?ausencias=1')).toBe('/people?absences=1');
    expect(go('/configuracao?tab=perfil&perfil=12')).toBe('/settings?tab=profile&profile=12');
    expect(go('/apresentar/plateia?canal=a%20b')).toBe('/present/audience?channel=a+b');
  });

  it('lets an English key win over its old spelling', () => {
    expect(go('/presentation?modelo=1&template=2')).toBe('/presentation?template=2');
  });
});

describe('normalizeLegacyUrl: what it keeps', () => {
  it('keeps the shared filters', () => {
    expect(go('/fluxo?board=1,2&type=Story&start=2026-09-01&end=2026-09-30')).toBe(
      '/flow?board=1,2&type=Story&start=2026-09-01&end=2026-09-30',
    );
    expect(go('/boards/1/sprints/9?tab=riscos&situation=bloqueado&person=abc')).toBe(
      '/boards/1/sprints/9?tab=risks&situation=bloqueado&person=abc',
    );
  });

  it('answers null for URLs that are already English', () => {
    for (const url of [
      '/',
      '/flow?board=1',
      '/people',
      '/people/abc?tab=week',
      '/people?tab=my-week&absences=1',
      '/presentation?template=3&wizard=1',
      '/present/audience?channel=x',
      '/settings?tab=fields',
      '/settings/wizard',
      '/shared/tok',
      '/getting-started',
      '/focus-timeline',
      '/my-week',
      '/boards/1/sprints/9?tab=work-tree',
      '/issues/CAD-1',
      '/status?tab=health',
    ]) {
      expect(go(url), url).toBeNull();
    }
  });

  it('does not re-encode a query it did not touch', () => {
    expect(go('/fluxo?type=User%20Story')).toBe('/flow?type=User%20Story');
  });
});
