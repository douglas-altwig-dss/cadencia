/**
 * The team's focus log as pure functions: the document it keeps, the entries the grid shows, and the
 * buckets (days, weeks or months) they fall into. `pages/TimelineFocusPage.tsx` draws; nothing here knows React.
 *
 * Dates arrive as `dd/mm/aaaa` (how people type them and how the log stores them) and are worked on as
 * ISO `aaaa-mm-dd` strings in UTC, so no timezone can move an entry to another day.
 */

import { collator } from '../i18n';

export type Gran = 'dia' | 'semana' | 'mes';
export type Preset = '14d' | '30d' | '90d' | 'all';
export type EstiloLinha = 'borda-gradiente' | 'borda-tracejada' | 'borda-dupla' | 'borda-solida';

export interface Pessoa {
  id: string;
  nome: string;
  cargo: string;
  cor: string;
}

export interface Tema {
  nome: string;
  cor: string;
  /** Comma-separated words; an entry whose text holds one of them is filed under this theme. */
  palavras: string;
}

/** One line of the log as stored. A `troca` is a change of focus, drawn as a highlighted card. */
export interface Registro {
  uid: string;
  tipo: 'tarefa' | 'troca';
  nome: string;
  /** dd/mm/aaaa */
  data: string;
  registro: string;
  deTema?: string;
  paraTema?: string;
  icone?: string;
  corDestaque?: string;
  estiloLinha?: EstiloLinha;
}

export interface Documento {
  pessoas: Pessoa[];
  registros: Registro[];
  temas: Tema[];
  sinais: Sinal[];
}

/** What the grid draws: a stored line after the manager's name and date rules were applied. */
export interface Entrada {
  uid: string;
  pessoa: string;
  dataIso: string;
  texto: string;
  tipo: 'tarefa' | 'troca';
  deTema?: string;
  paraTema?: string;
  icone?: string;
  corDestaque?: string;
  estiloLinha?: EstiloLinha;
  temas: string[];
  tags: string[];
}

/**
 * A signal is a condition a line is in (blocked, waiting, urgent). The team defines it by its words, the
 * same way a theme is defined, and it is shown on the line; a theme says what the work is about.
 */
export interface Sinal {
  nome: string;
  cor: string;
  /** Comma-separated words, as a theme's. */
  palavras: string;
  /** What the signal means, in the team's words. */
  gatilho: string;
}

export interface Filtros {
  busca: string;
  gran: Gran;
  preset: Preset;
  pessoasOn: string[];
  temasOn: string[];
  sinaisOn: string[];
  ocultarVazios: boolean;
  apenasTrocas: boolean;
}

/** The manager of the log: the one whose own lines name the people they mention. */
export const GESTOR = 'Douglas';

export const PALETA_PESSOAS = ['#0B7A75', '#B4463C', '#7B5EA7', '#B07A12', '#3A6EA5', '#6B7D2A', '#EC4899', '#10B981'];
export const PALETA_DESTAQUE = ['#6366F1', '#2563EB', '#EF4444', '#F59E0B', '#10B981', '#EC4899', '#8B5CF6'];
export const ICONES_TROCA = ['🔀', '🎯', '🚀', '🔄', '⚡', '🛡️', '🛑', '💡'];
export const ESTILOS_LINHA: { value: EstiloLinha; label: string }[] = [
  { value: 'borda-gradiente', label: 'Gradiente neon' },
  { value: 'borda-tracejada', label: 'Tracejado tático' },
  { value: 'borda-dupla', label: 'Dupla linha' },
  { value: 'borda-solida', label: 'Sólido com destaque' },
];
/** A change of focus can leave a theme for "Outro / Pausa", which is not a theme of the log. */
export const PAUSA = 'Outro / Pausa';

/** The team's starting signals: the four that were fixed in the code, and five more for the usual conditions. */
export const SINAIS_PADRAO: Sinal[] = [
  {
    nome: 'Bloqueado',
    cor: '#EF4444',
    palavras: 'bloquead',
    gatilho: 'o texto cita bloqueio ("bloqueado", "bloqueada")',
  },
  {
    nome: 'Aguardando',
    cor: '#F59E0B',
    palavras: 'aguard',
    gatilho: 'o texto cita espera ("aguardando", "aguardar")',
  },
  {
    nome: 'Mudança de prioridade',
    cor: '#3B82F6',
    palavras: 'troca de prioridade, realocad',
    gatilho: 'o texto cita troca de prioridade ou realocação',
  },
  {
    nome: 'Prioridade 1',
    cor: '#8B5CC4',
    palavras: 'prioridade numero 1, prioridade 1',
    gatilho: 'o texto cita "prioridade número 1"',
  },
  {
    nome: 'Impedimento',
    cor: '#DC2626',
    palavras: 'impedimento, impedido',
    gatilho: 'o texto cita impedimento ou impedido',
  },
  {
    nome: 'Urgente',
    cor: '#E11D48',
    palavras: 'urgente, urgencia',
    gatilho: 'o texto cita urgência',
  },
  {
    nome: 'Em risco',
    cor: '#EA580C',
    palavras: 'em risco, risco de atraso',
    gatilho: 'o texto cita risco de atraso',
  },
  {
    nome: 'Dependência externa',
    cor: '#0EA5E9',
    palavras: 'depende de, dependencia externa',
    gatilho: 'o texto cita dependência de outra equipe',
  },
  {
    nome: 'Retrabalho',
    cor: '#0D9488',
    palavras: 'retrabalho, refazer, reabrir',
    gatilho: 'o texto cita retrabalho ou refazer',
  },
];

export const DOCUMENTO_INICIAL: Documento = {
  sinais: SINAIS_PADRAO,
  pessoas: [
    { id: 'p1', nome: 'Alvaro', cargo: 'Eng. de Dados', cor: '#0B7A75' },
    { id: 'p2', nome: 'Luiz', cargo: 'Tech Lead', cor: '#B4463C' },
    { id: 'p3', nome: 'Bruno', cargo: 'DevOps & Cloud', cor: '#7B5EA7' },
  ],
  temas: [
    {
      nome: 'CI/CD',
      cor: '#2563EB',
      palavras: 'ci/cd, dab, repositorio, padronizacao',
    },
    {
      nome: 'Migração',
      cor: '#D97706',
      palavras: 'migra, sync, tabelas de risco',
    },
    { nome: 'Ontologia / Tags', cor: '#9333EA', palavras: 'ontologia, tag' },
    {
      nome: 'Databricks App',
      cor: '#DB2777',
      palavras: 'ontology hub, aplicativo databricks, app databricks',
    },
    { nome: 'Workspace DEV', cor: '#059669', palavras: 'workspace' },
    {
      nome: 'Alinhamento',
      cor: '#64748B',
      palavras: 'alinhamento, refinamento',
    },
  ],
  registros: [
    {
      uid: 'r1',
      tipo: 'tarefa',
      nome: 'Douglas',
      data: '1/10/2026',
      registro: 'Alinhamento sobre refinamento semanal de tarefas.',
    },
    {
      uid: 'r2',
      tipo: 'tarefa',
      nome: 'Douglas',
      data: '1/10/2026',
      registro:
        'Papéis e Responsabilidades: Alvaro está com CI/CD, enquanto Luiz está com Migração (bloqueado pela ferramenta de Sync) e Bruno está com Workspace de DEV.',
    },
    {
      uid: 'r3',
      tipo: 'tarefa',
      nome: 'Luiz',
      data: '1/10/2026',
      registro: 'Validar arquivo de migração de tabelas enquanto aguardo o job de sync realizar deploy.',
    },
    {
      uid: 'r4',
      tipo: 'tarefa',
      nome: 'Alvaro',
      data: '1/10/2026',
      registro: '[CI/CD] Criação de repositório template + template DAB.',
    },
    {
      uid: 'r5',
      tipo: 'troca',
      nome: 'Luiz',
      data: '2/10/2026',
      registro: 'Validação de migração pausada para focar na entrega prioritária do aplicativo Databricks.',
      deTema: 'Migração',
      paraTema: 'Databricks App',
      icone: '🔀',
      corDestaque: '#6366F1',
      estiloLinha: 'borda-gradiente',
    },
    {
      uid: 'r6',
      tipo: 'tarefa',
      nome: 'Luiz',
      data: '2/10/2026',
      registro: 'Prioridade número 1 do dia é testar o aplicativo Databricks (DSS Ontology Hub).',
    },
    {
      uid: 'r7',
      tipo: 'tarefa',
      nome: 'Douglas',
      data: '2/10/2026',
      registro: 'Alvaro: seguir com a padronização do repositório e das DABs.',
    },
    {
      uid: 'r8',
      tipo: 'tarefa',
      nome: 'Douglas',
      data: '2/10/2026',
      registro: 'Luiz: validar documentos de migração (CSVs de coluna e tabela); aguardar a disponibilização da ferramenta de sync.',
    },
  ],
};

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const norm = (s: string) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `dd/mm/aaaa` to a UTC date, or null when it is not a real day. */
export function parseDate(s: string): Date | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(s || '');
  if (!m) return null;
  const d = +m[1];
  const mo = +m[2];
  const y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}

export const isoOf = (dt: Date) => dt.toISOString().slice(0, 10);
/** ISO `aaaa-mm-dd` to `d/m/aaaa`, the form the log stores. */
export const brDeIso = (iso: string) => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** `d/m/aaaa` back to ISO `aaaa-mm-dd`, for a date input or the API. */
export const isoDeBr = (br: string): string => {
  const [d, m, y] = br.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};
/** ISO to `dd/mm`, the short form of a column header. */
export const fmtCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const addDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
};
/** The Monday of the week an ISO date falls in. */
export const segunda = (iso: string) => {
  const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDias(iso, -dow);
};
export const mesIso = (iso: string) => `${iso.slice(0, 7)}-01`;
export const diaSemana = (iso: string) => DIAS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
export const isFimDeSemana = (iso: string) => {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
};

export const bucketOf = (iso: string, gran: Gran) => (gran === 'semana' ? segunda(iso) : gran === 'mes' ? mesIso(iso) : iso);

/** The manager's name is written the way the team writes it; anyone else is capitalised. */
export function canon(documento: Documento, nome: string): string {
  const t = String(nome || '').trim();
  const pessoa = documento.pessoas.find((p) => norm(p.nome) === norm(t));
  if (pessoa) return pessoa.nome;
  if (norm(GESTOR) === norm(t)) return GESTOR;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function temasDoTexto(documento: Documento, nt: string): string[] {
  return documento.temas
    .filter((t) => {
      const palavras = t.palavras
        .split(',')
        .map((x) => norm(x.trim()))
        .filter(Boolean);
      return palavras.some((p) => nt.includes(p));
    })
    .map((t) => t.nome);
}

/** The signals a text carries: those whose words it holds, found the way a theme is. */
export const sinaisDoTexto = (documento: Documento, nt: string): string[] =>
  documento.sinais
    .filter((s) =>
      s.palavras
        .split(',')
        .map((x) => norm(x.trim()))
        .filter(Boolean)
        .some((p) => nt.includes(p)),
    )
    .map((s) => s.nome);

/**
 * The entries the grid works on. A line of the manager (`GESTOR`) that names team members is split at
 * each name, so one line can file work under several people; the rest is filed under "Geral".
 */
export function montarEntradas(documento: Documento): Entrada[] {
  const nomes = documento.pessoas.map((p) => norm(p.nome));
  const mencaoRe = nomes.length ? new RegExp(`\\b(${nomes.map(escapeRe).join('|')})\\b`, 'gi') : null;
  const entradas: Entrada[] = [];

  documento.registros.forEach((r) => {
    const dt = parseDate(r.data);
    if (!dt) return;
    const dataIso = isoOf(dt);
    const txt = String(r.registro || '');
    const nt = norm(txt);

    if (r.tipo === 'troca') {
      entradas.push({
        uid: r.uid,
        pessoa: canon(documento, r.nome),
        dataIso,
        texto: txt,
        tipo: 'troca',
        deTema: r.deTema || 'Anterior',
        paraTema: r.paraTema || 'Novo foco',
        icone: r.icone || '🔀',
        corDestaque: r.corDestaque || '#6366F1',
        estiloLinha: r.estiloLinha || 'borda-gradiente',
        temas: [r.paraTema].filter((x): x is string => !!x),
        tags: sinaisDoTexto(documento, nt),
      });
      return;
    }

    if (norm(r.nome) !== norm(GESTOR)) {
      entradas.push({
        uid: r.uid,
        pessoa: canon(documento, r.nome),
        dataIso,
        texto: txt,
        tipo: 'tarefa',
        temas: temasDoTexto(documento, nt),
        tags: sinaisDoTexto(documento, nt),
      });
      return;
    }

    const mencoes: { idx: number; len: number; nome: string }[] = [];
    if (mencaoRe) {
      mencaoRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = mencaoRe.exec(nt)))
        mencoes.push({
          idx: m.index,
          len: m[0].length,
          nome: canon(documento, m[0]),
        });
    }

    if (!mencoes.length) {
      entradas.push({
        uid: r.uid,
        pessoa: 'Geral',
        dataIso,
        texto: txt,
        tipo: 'tarefa',
        temas: temasDoTexto(documento, nt),
        tags: sinaisDoTexto(documento, nt),
      });
      return;
    }

    mencoes.forEach((menc, k) => {
      const fim = k + 1 < mencoes.length ? mencoes[k + 1].idx : txt.length;
      let sub = txt
        .slice(menc.idx + menc.len, fim)
        .trim()
        .replace(/^[:\-–—]\s*/, '');
      sub = sub.replace(/\s*(?:[,;]|\b(?:e|enquanto)\b)\s*$/i, '');
      if (!sub) sub = txt;
      entradas.push({
        uid: r.uid,
        pessoa: menc.nome,
        dataIso,
        texto: sub,
        tipo: 'tarefa',
        temas: temasDoTexto(documento, norm(sub)),
        tags: sinaisDoTexto(documento, norm(sub)),
      });
    });
  });

  return entradas;
}

/** The entries that pass the filters, and the buckets the grid shows as columns. */
export function filtrar(entradas: Entrada[], filtros: Filtros, hoje: string) {
  const q = norm(filtros.busca.trim());
  const minIso = filtros.preset === 'all' ? '0000-00-00' : addDias(hoje, -(filtros.preset === '14d' ? 14 : filtros.preset === '30d' ? 30 : 90));
  const pessoas = new Set(filtros.pessoasOn);
  const temas = new Set(filtros.temasOn);
  const sinais = new Set(filtros.sinaisOn);

  const visiveis = entradas.filter((e) => {
    if (e.dataIso < minIso) return false;
    if (!pessoas.has(e.pessoa) && e.pessoa !== 'Geral') return false;
    if (filtros.apenasTrocas && e.tipo !== 'troca') return false;
    if (q && !norm(`${e.texto} ${e.pessoa} ${e.deTema ?? ''} ${e.paraTema ?? ''}`).includes(q)) return false;
    if (temas.size && !e.temas.some((t) => temas.has(t))) return false;
    if (sinais.size && !e.tags.some((s) => sinais.has(s))) return false;
    return true;
  });

  return { entradas: visiveis, buckets: bucketsDe(visiveis, filtros) };
}

/** Consecutive buckets from the first to the last entry, or only the ones with entries when empty ones are hidden. */
export function bucketsDe(entradas: Entrada[], filtros: Pick<Filtros, 'gran' | 'ocultarVazios'>): string[] {
  if (!entradas.length) return [];
  const datas = entradas.map((e) => e.dataIso).sort();
  if (filtros.ocultarVazios) return [...new Set(entradas.map((e) => bucketOf(e.dataIso, filtros.gran)))].sort();
  const bucketsSet = new Set<string>();
  for (let cur = datas[0]; cur <= datas[datas.length - 1]; cur = addDias(cur, 1)) bucketsSet.add(bucketOf(cur, filtros.gran));
  return [...bucketsSet].sort();
}

/** Column header text for a bucket. */
export function rotuloBucket(bucket: string, gran: Gran): { titulo: string; sub: string } {
  if (gran === 'semana')
    return {
      titulo: `${fmtCurto(bucket)} - ${fmtCurto(addDias(bucket, 6))}`,
      sub: 'Semana',
    };
  if (gran === 'mes') return { titulo: bucket.slice(0, 7), sub: 'Mês' };
  return { titulo: fmtCurto(bucket), sub: diaSemana(bucket) };
}

/** Months with their entry counts, for the month jump bar. */
export function mesesDe(buckets: string[]): { mes: string; rotulo: string; qtd: number }[] {
  const meses = new Map<string, number>();
  buckets.forEach((b) => {
    const m = b.slice(0, 7);
    meses.set(m, (meses.get(m) ?? 0) + 1);
  });
  return [...meses.entries()].map(([mes, qtd]) => {
    const [ano, m] = mes.split('-');
    return { mes, rotulo: `${MESES[+m - 1]} / ${ano.slice(2)}`, qtd };
  });
}

/** The people a document holds, and how many entries each one has in it. */
export const contagemPorPessoa = (entradas: Entrada[], nome: string) => entradas.filter((e) => e.pessoa === nome).length;

export const corDaPessoa = (documento: Documento, nome: string) => documento.pessoas.find((p) => p.nome === nome)?.cor ?? '#3B82F6';
export const corDoTema = (documento: Documento, nome: string) => documento.temas.find((t) => t.nome === nome)?.cor ?? '#3B82F6';
export const corDoSinal = (documento: Documento, nome: string) => documento.sinais.find((s) => s.nome === nome)?.cor ?? '#F59E0B';

/** Initials for an avatar: the first two letters of the name. */
export const iniciais = (nome: string) => nome.slice(0, 2).toUpperCase();

/** A fresh copy of the seed, so an edit never reaches the constant it was copied from. */
export function documentoInicial(): Documento {
  return {
    pessoas: DOCUMENTO_INICIAL.pessoas.map((p) => ({ ...p })),
    temas: DOCUMENTO_INICIAL.temas.map((t) => ({ ...t })),
    sinais: DOCUMENTO_INICIAL.sinais.map((s) => ({ ...s })),
    registros: DOCUMENTO_INICIAL.registros.map((r) => ({ ...r })),
  };
}

/** What the records can be ordered by. `ordem` is the order they were written in, the grid's default. */
export type CriterioOrdem = 'ordem' | 'data' | 'pessoa' | 'tipo' | 'texto';
export type DirecaoOrdem = 'asc' | 'desc';
export interface Ordem {
  criterio: CriterioOrdem;
  direcao: DirecaoOrdem;
}

export const CRITERIOS_ORDEM: { value: CriterioOrdem; label: string }[] = [
  { value: 'ordem', label: 'Ordem de registro' },
  { value: 'data', label: 'Data' },
  { value: 'pessoa', label: 'Pessoa' },
  { value: 'tipo', label: 'Tipo' },
  { value: 'texto', label: 'Descrição' },
];

/**
 * The records in the order asked for. Ties keep the order they were written in, so sorting by one column
 * never shuffles the rest. Descending reverses the chosen comparison, not the tie-break.
 */
export function ordenar(entradas: Entrada[], ordem: Ordem): Entrada[] {
  const indice = new Map(entradas.map((e, i) => [e, i]));
  const comparar = (a: Entrada, b: Entrada): number => {
    switch (ordem.criterio) {
      case 'data':
        return a.dataIso.localeCompare(b.dataIso);
      case 'pessoa':
        return collator().compare(a.pessoa, b.pessoa);
      case 'tipo':
        return a.tipo.localeCompare(b.tipo);
      case 'texto':
        return collator().compare(a.texto, b.texto);
      default:
        return 0;
    }
  };
  const sinal = ordem.direcao === 'desc' ? -1 : 1;
  return [...entradas].sort((a, b) => sinal * comparar(a, b) || (indice.get(a) ?? 0) - (indice.get(b) ?? 0));
}
