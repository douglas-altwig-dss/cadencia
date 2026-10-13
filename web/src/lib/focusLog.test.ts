import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type Locale, setLocaleForTests } from '../i18n';

import {
  addDias,
  bucketsDe,
  documentoInicial,
  type Documento,
  type Entrada,
  filtrar,
  type Filtros,
  mesesDe,
  montarEntradas,
  ordenar,
  parseDate,
  rotuloBucket,
  segunda,
} from './focusLog';

const base = (): Documento => documentoInicial();

const filtros = (over: Partial<Filtros> = {}): Filtros => ({
  busca: '',
  gran: 'dia',
  preset: 'all',
  pessoasOn: ['Alvaro', 'Luiz', 'Bruno', 'Douglas'],
  temasOn: [],
  sinaisOn: [],
  ocultarVazios: false,
  apenasTrocas: false,
  ...over,
});

describe('parseDate', () => {
  it('reads dd/mm/aaaa and rejects days that do not exist', () => {
    expect(parseDate('1/10/2026')?.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('nope')).toBeNull();
  });
});

describe('segunda and addDias', () => {
  it('finds the Monday of the week, across month boundaries', () => {
    expect(segunda('2026-10-04')).toBe('2026-09-28');
    expect(segunda('2026-10-05')).toBe('2026-10-05');
    expect(addDias('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('montarEntradas', () => {
  it('files a troca under its new theme and a plain line under the people it names', () => {
    const entradas = montarEntradas(base());
    const troca = entradas.find((e) => e.tipo === 'troca') as Entrada;
    expect(troca).toMatchObject({ pessoa: 'Luiz', temas: ['Databricks App'], tags: [] });
    expect(entradas.find((e) => e.uid === 'r4')).toMatchObject({ pessoa: 'Alvaro', temas: ['CI/CD'] });
  });

  it('splits a manager line at each name it mentions', () => {
    const entradas = montarEntradas(base());
    const deR2 = entradas.filter((e) => e.uid === 'r2');
    expect(deR2.map((e) => e.pessoa).sort()).toEqual(['Alvaro', 'Bruno', 'Luiz']);
    const deR8 = entradas.filter((e) => e.uid === 'r8');
    expect(deR8.map((e) => e.pessoa)).toEqual(['Luiz']);
    expect(deR8[0].texto).toContain('validar documentos de migração');
  });

  it('files a manager line that names nobody under Geral', () => {
    const doc = base();
    doc.registros = [{ uid: 'g', tipo: 'tarefa', nome: 'Douglas', data: '3/10/2026', registro: 'Revisão geral do mês.' }];
    expect(montarEntradas(doc)).toMatchObject([{ pessoa: 'Geral', texto: 'Revisão geral do mês.' }]);
  });

  it('skips a line whose date is not real', () => {
    const doc = base();
    doc.registros = [{ uid: 'x', tipo: 'tarefa', nome: 'Luiz', data: '31/02/2026', registro: 'Nunca.' }];
    expect(montarEntradas(doc)).toEqual([]);
  });
});

describe('filtrar and bucketsDe', () => {
  const entradas = montarEntradas(base());
  const hoje = '2026-10-04';

  it('fills every day between the first and last entry unless empty days are hidden', () => {
    const todos = filtrar(entradas, filtros(), hoje).buckets;
    expect(todos).toEqual(['2026-10-01', '2026-10-02']);
    const sem = bucketsDe(
      entradas.filter((e) => e.dataIso === '2026-10-02'),
      { gran: 'dia', ocultarVazios: true },
    );
    expect(sem).toEqual(['2026-10-02']);
  });

  it('keeps only the last 14 days for the 14d preset', () => {
    const antigo = { ...entradas[0], dataIso: '2026-08-01' };
    const r = filtrar([...entradas, antigo], filtros({ preset: '14d' }), hoje);
    expect(r.entradas.every((e) => e.dataIso >= '2026-09-20')).toBe(true);
  });

  it('applies the search across text and people, and the only-trocas switch', () => {
    expect(filtrar(entradas, filtros({ busca: 'sync' }), hoje).entradas.length).toBeGreaterThan(0);
    expect(filtrar(entradas, filtros({ busca: 'zzz' }), hoje).entradas).toEqual([]);
    const trocas = filtrar(entradas, filtros({ apenasTrocas: true }), hoje).entradas;
    expect(trocas.every((e) => e.tipo === 'troca')).toBe(true);
  });

  it('groups by week and month into the right bucket', () => {
    expect(bucketsDe(entradas, { gran: 'semana', ocultarVazios: true })).toEqual(['2026-09-28']);
    expect(bucketsDe(entradas, { gran: 'mes', ocultarVazios: true })).toEqual(['2026-10-01']);
  });
});

describe('signals are the team\'s own, found by their words', () => {
  it('finds a signal a change of focus carries in its motive, as a theme is found', () => {
    const doc = base();
    doc.registros = [
      {
        uid: 'u',
        tipo: 'troca',
        nome: 'Luiz',
        data: '2/10/2026',
        registro: 'Entrega urgente do app.',
        deTema: 'Migração',
        paraTema: 'Databricks App',
      },
    ];
    expect(montarEntradas(doc)[0].tags).toEqual(['Urgente']);
  });

  it('finds nothing for a signal the team has not defined', () => {
    const doc = base();
    doc.sinais = [];
    doc.registros = [{ uid: 'b', tipo: 'tarefa', nome: 'Luiz', data: '2/10/2026', registro: 'Bloqueado pelo deploy.' }];
    expect(montarEntradas(doc)[0].tags).toEqual([]);
  });
});

describe('signals are filtered apart from themes', () => {
  const entradas = montarEntradas(base());

  it('keeps the lines carrying a chosen signal, whatever their theme', () => {
    const bloqueio = filtrar(entradas, filtros({ sinaisOn: ['Bloqueado'] }), '2026-10-04').entradas;
    expect(bloqueio.length).toBeGreaterThan(0);
    expect(bloqueio.every((e) => e.tags.includes('Bloqueado'))).toBe(true);
  });

  it('does not treat a signal name as a theme', () => {
    const porTema = filtrar(entradas, filtros({ temasOn: ['Bloqueado'] }), '2026-10-04').entradas;
    expect(porTema).toEqual([]);
  });

  it('keeps every signal and every theme apart in the data itself', () => {
    const e = entradas.find((x) => x.uid === 'r3');
    expect(e?.temas).toEqual(['Migração']);
    expect(e?.tags).toEqual(['Aguardando']);
  });
});

describe('labels', () => {
  // The labels are asserted in pt-BR, the wording they were written in.
  let previous: Locale;
  beforeEach(() => {
    previous = setLocaleForTests('pt-BR');
  });
  afterEach(() => {
    setLocaleForTests(previous);
  });

  it('names the column and the month jump', () => {
    expect(rotuloBucket('2026-10-01', 'dia')).toEqual({ titulo: '01/10', sub: 'Qui' });
    expect(rotuloBucket('2026-09-28', 'semana')).toEqual({ titulo: '28/09 - 04/10', sub: 'Semana' });
    expect(mesesDe(['2026-09-28', '2026-10-01', '2026-10-02'])).toEqual([
      { mes: '2026-09', rotulo: 'Set / 26', qtd: 1 },
      { mes: '2026-10', rotulo: 'Out / 26', qtd: 2 },
    ]);
  });

  it('follows the current language', () => {
    setLocaleForTests('en-US');
    expect(rotuloBucket('2026-10-01', 'dia')).toEqual({ titulo: '01/10', sub: 'Thu' });
    expect(mesesDe(['2026-09-28'])[0].rotulo).toBe('Sep / 26');
  });
});

describe('ordenar', () => {
  const entradas = montarEntradas(base());
  const uids = (lista: Entrada[]) => lista.map((e) => e.uid);

  it('keeps the order the records were written in by default', () => {
    expect(uids(ordenar(entradas, { criterio: 'ordem', direcao: 'asc' }))).toEqual(uids(entradas));
  });

  it('sorts by date, earliest first, and reverses for descending', () => {
    const asc = ordenar(entradas, { criterio: 'data', direcao: 'asc' });
    expect(asc[0].dataIso <= asc[asc.length - 1].dataIso).toBe(true);
    const desc = ordenar(entradas, { criterio: 'data', direcao: 'desc' });
    expect(desc[0].dataIso).toBe(asc[asc.length - 1].dataIso);
  });

  it('keeps the written order among records that tie', () => {
    const datas = ordenar(entradas, { criterio: 'data', direcao: 'asc' }).filter((e) => e.dataIso === '2026-10-01');
    const escritos = entradas.filter((e) => e.dataIso === '2026-10-01');
    expect(uids(datas)).toEqual(uids(escritos));
  });

  it('sorts by person and by description', () => {
    const pessoas = ordenar(entradas, { criterio: 'pessoa', direcao: 'asc' }).map((e) => e.pessoa);
    expect(pessoas).toEqual([...pessoas].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    const textos = ordenar(entradas, { criterio: 'texto', direcao: 'asc' }).map((e) => e.texto);
    expect(textos).toEqual([...textos].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });
});
