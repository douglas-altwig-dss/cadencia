import { ActionIcon, Button, Chip, Group, Paper, SegmentedControl, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { IconArrowBackUp, IconArrowDown, IconArrowForwardUp, IconArrowUp, IconPlus, IconSearch } from '@tabler/icons-react';
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Empty, ErrorState, Loading, PageHeader } from '../components/common';
import { AtividadeModal, EquipeDrawer, SinaisDrawer, TemasDrawer, TrocaModal } from '../components/focuslog/FocusDialogs';
import { RegistrosLista } from '../components/focuslog/RegistrosLista';
import { TarefaCard, TrocaCard } from '../components/focuslog/FocusCards';
import { useT } from '../i18n';
import {
  bucketOf,
  contagemPorPessoa,
  corDaPessoa,
  type Documento,
  type Entrada,
  type Filtros,
  type Gran,
  filtrar,
  iniciais,
  isFimDeSemana,
  isoOf,
  mesesDe,
  montarEntradas,
  type Preset,
  type Registro,
  rotuloBucket,
  brDeIso,
  criteriosOrdem,
  GERAL,
  type CriterioOrdem,
  type Ordem,
  ordenar,
} from '../lib/focusLog';
import { type FocusLog, useFocusLog } from '../lib/focusLogStore';

type Dialogo =
  | { tipo: 'equipe' }
  | { tipo: 'temas' }
  | { tipo: 'sinais' }
  | { tipo: 'troca'; registro: Registro | null; seed?: Partial<Registro> }
  | { tipo: 'atividade'; registro: Registro | null; pessoa?: string }
  | null;


/**
 * The team's focus over time: one lane per person, one column per day, week or month, with each line
 * as a card and each change of focus as a highlighted card. Edits are kept in this browser, with undo.
 */
export function TimelineFocusPage() {
  const t = useT();
  const log = useFocusLog();
  if (!log.doc) {
    return log.error ? <ErrorState error={log.error} title={t.people.focus.page.loadError} /> : <Loading rows={6} />;
  }
  return <FocusLogBoard log={{ ...log, doc: log.doc }} />;
}

function FocusLogBoard({ log }: { log: FocusLog & { doc: Documento } }) {
  const t = useT();
  const tf = t.people.focus.page;
  const { doc, commit, undo, redo, canUndo, canRedo, saving, conflito } = log;
  const presets: { value: Preset; label: string }[] = [
    { value: '14d', label: tf.presetDays(14) },
    { value: '30d', label: tf.presetDays(30) },
    { value: '90d', label: tf.presetDays(90) },
    { value: 'all', label: tf.presetAll },
  ];
  const [busca, setBusca] = useState('');
  const [gran, setGran] = useState<Gran>('dia');
  const [preset, setPreset] = useState<Preset>('all');
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [temasOn, setTemasOn] = useState<string[]>([]);
  const [sinaisOn, setSinaisOn] = useState<string[]>([]);
  const [ocultarVazios, setOcultarVazios] = useState(false);
  const [apenasTrocas, setApenasTrocas] = useState(false);
  const [compacto, setCompacto] = useState(false);
  const [visao, setVisao] = useState<'grade' | 'lista'>('grade');
  const [ordem, setOrdem] = useState<Ordem>({
    criterio: 'ordem',
    direcao: 'asc',
  });
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const entradas = useMemo(() => montarEntradas(doc), [doc]);
  const pessoasVisiveis = useMemo(() => doc.pessoas.filter((p) => !ocultas.includes(p.nome)), [doc.pessoas, ocultas]);

  const filtros: Filtros = useMemo(
    () => ({
      busca,
      gran,
      preset,
      pessoasOn: pessoasVisiveis.map((p) => p.nome),
      temasOn,
      sinaisOn,
      ocultarVazios,
      apenasTrocas,
    }),
    [busca, gran, preset, pessoasVisiveis, temasOn, sinaisOn, ocultarVazios, apenasTrocas],
  );
  const { entradas: filtradas, buckets } = useMemo(() => filtrar(entradas, filtros, isoOf(new Date())), [entradas, filtros]);
  const visiveis = useMemo(() => ordenar(filtradas, ordem), [filtradas, ordem]);

  // Entries by person and bucket, so each cell reads its own list instead of scanning all of them.
  const celulas = useMemo(() => {
    const map = new Map<string, Entrada[]>();
    visiveis.forEach((e) => {
      const key = `${e.pessoa}|${bucketOf(e.dataIso, gran)}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    });
    return map;
  }, [visiveis, gran]);

  const totalTrocas = entradas.filter((e) => e.tipo === 'troca').length;
  const hoje = isoOf(new Date());

  // Ctrl+Z and Ctrl+Y belong to a text box while one has the focus; elsewhere they undo and redo the log.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const alvo = event.target as HTMLElement;
      const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) || alvo.isContentEditable;
      if (!digitando && event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !digitando) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && !digitando) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const abrirAtividade = (uid: string) => {
    const registro = doc.registros.find((r) => r.uid === uid) ?? null;
    if (!registro) return;
    setDialogo(registro.tipo === 'troca' ? { tipo: 'troca', registro } : { tipo: 'atividade', registro });
  };

  const novaTroca = () => {
    if (!doc.pessoas.length) {
      setDialogo({ tipo: 'equipe' });
      return;
    }
    setDialogo({ tipo: 'troca', registro: null });
  };

  const soltar = (pessoa: string, bucket: string, uid: string) => {
    const data = brDeIso(bucket);
    commit((d) => ({
      ...d,
      registros: d.registros.map((r) => (r.uid === uid ? { ...r, nome: pessoa, data } : r)),
    }));
    setDropKey(null);
  };

  const saltarParaMes = (mes: string) => {
    const bucket = buckets.find((b) => b.startsWith(mes));
    if (bucket)
      document.getElementById(`tf-col-${bucket}`)?.scrollIntoView({
        behavior: 'smooth',
        inline: 'start',
        block: 'nearest',
      });
  };

  const meses = mesesDe(buckets);
  const larguraColuna = compacto ? 'minmax(140px, 1fr)' : 'minmax(250px, 1fr)';

  return (
    <>
      <PageHeader
        title={tf.title}
        documentTitle={tf.title}
        subtitle={tf.subtitle(doc.pessoas.length, entradas.length, totalTrocas)}
        actions={
          <Group gap="xs" wrap="nowrap">
            <ActionIcon variant="default" size="lg" aria-label={tf.undo} title={tf.undo} disabled={!canUndo} onClick={undo}>
              <IconArrowBackUp size={16} />
            </ActionIcon>
            <ActionIcon variant="default" size="lg" aria-label={tf.redo} title={tf.redo} disabled={!canRedo} onClick={redo}>
              <IconArrowForwardUp size={16} />
            </ActionIcon>
            <Button variant="default" size="sm" onClick={() => setDialogo({ tipo: 'equipe' })}>
              {tf.team}
            </Button>
            <Button variant="default" size="sm" onClick={() => setDialogo({ tipo: 'temas' })}>
              {tf.themes}
            </Button>
            <Button variant="default" size="sm" onClick={() => setDialogo({ tipo: 'sinais' })}>
              {tf.signals}
            </Button>
            <Button variant="light" color="violet" size="sm" onClick={novaTroca}>
              {tf.shift}
            </Button>
            <Button size="sm" leftSection={<IconPlus size={14} />} onClick={() => setDialogo({ tipo: 'atividade', registro: null })}>
              {tf.activity}
            </Button>
          </Group>
        }
      />

      <Paper withBorder p="sm" mb="md">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
            <Stack gap={6}>
              <Group gap={6} wrap="wrap" align="center">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  {tf.team}
                </Text>
                <Chip.Group
                  multiple
                  value={pessoasVisiveis.map((p) => p.nome)}
                  onChange={(nomes) => setOcultas(doc.pessoas.map((p) => p.nome).filter((n) => !nomes.includes(n)))}
                >
                  <Group gap={4}>
                    {doc.pessoas.map((p) => (
                      <Chip key={p.id} value={p.nome} size="xs" variant="outline">
                        <span className="tf-dot" style={{ background: p.cor }} aria-hidden />
                        {p.nome}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              </Group>
              <Group gap={6} wrap="wrap" align="center">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" title={tf.themesTip}>
                  {tf.themes}
                </Text>
                <Chip.Group multiple value={temasOn} onChange={setTemasOn}>
                  <Group gap={4}>
                    {doc.temas.map((tema) => (
                      <Chip key={tema.nome} value={tema.nome} size="xs" variant="light">
                        <span className="tf-dot" style={{ background: tema.cor }} aria-hidden />
                        {tema.nome}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              </Group>
              <Group gap={6} wrap="wrap" align="center">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" title={tf.signalsTip}>
                  {tf.signals}
                </Text>
                <Chip.Group multiple value={sinaisOn} onChange={setSinaisOn}>
                  <Group gap={4}>
                    {doc.sinais.map((s) => (
                      <Chip key={s.nome} value={s.nome} size="xs" variant="outline" color="gray" title={s.gatilho || undefined}>
                        <span className="tf-dot" style={{ background: s.cor }} aria-hidden />
                        {s.nome}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              </Group>
            </Stack>

            <Group gap="sm" wrap="wrap" align="center">
              <SegmentedControl size="xs" value={preset} onChange={(v) => setPreset(v as Preset)} data={presets} aria-label={tf.period} />
              <SegmentedControl
                size="xs"
                value={gran}
                onChange={(v) => setGran(v as Gran)}
                data={[
                  { value: 'dia', label: tf.day },
                  { value: 'semana', label: tf.week },
                  { value: 'mes', label: tf.month },
                ]}
                aria-label={tf.granularity}
              />
              <SegmentedControl
                size="xs"
                value={visao}
                onChange={(v) => setVisao(v as 'grade' | 'lista')}
                data={[
                  { value: 'grade', label: tf.grid },
                  { value: 'lista', label: tf.list },
                ]}
                aria-label={tf.view}
              />
              <Select
                size="xs"
                aria-label={tf.sortAria}
                w={170}
                allowDeselect={false}
                value={ordem.criterio}
                onChange={(v) =>
                  setOrdem((o) => ({
                    ...o,
                    criterio: (v ?? 'ordem') as CriterioOrdem,
                  }))
                }
                data={criteriosOrdem()}
              />
              <ActionIcon
                variant="default"
                size="lg"
                aria-label={ordem.direcao === 'asc' ? tf.ascAria : tf.descAria}
                title={ordem.direcao === 'asc' ? tf.asc : tf.desc}
                onClick={() =>
                  setOrdem((o) => ({
                    ...o,
                    direcao: o.direcao === 'asc' ? 'desc' : 'asc',
                  }))
                }
              >
                {ordem.direcao === 'asc' ? <IconArrowUp size={16} /> : <IconArrowDown size={16} />}
              </ActionIcon>
              <SegmentedControl
                size="xs"
                value={compacto ? 'compacto' : 'padrao'}
                onChange={(v) => setCompacto(v === 'compacto')}
                data={[
                  { value: 'padrao', label: tf.standard },
                  { value: 'compacto', label: tf.compact },
                ]}
                aria-label={tf.density}
              />
            </Group>
          </Group>

          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Group gap="sm" wrap="wrap" align="center">
              <TextInput
                ref={searchRef}
                aria-label={tf.searchAria}
                placeholder={tf.searchPlaceholder}
                leftSection={<IconSearch size={14} />}
                value={busca}
                onChange={(e) => setBusca(e.currentTarget.value)}
                w={280}
              />
              <Switch label={tf.hideEmpty} checked={ocultarVazios} onChange={(e) => setOcultarVazios(e.currentTarget.checked)} />
              <Switch label={tf.onlyShifts} checked={apenasTrocas} onChange={(e) => setApenasTrocas(e.currentTarget.checked)} />
            </Group>
            {meses.length > 0 && (
              <Group gap={4} wrap="wrap" aria-label={tf.jumpMonth}>
                {meses.map((m) => (
                  <Button
                    key={m.mes}
                    variant="subtle"
                    size="compact-xs"
                    onClick={() => saltarParaMes(m.mes)}
                    rightSection={<span className="tf-count">{m.qtd}</span>}
                  >
                    {m.rotulo}
                  </Button>
                ))}
              </Group>
            )}
          </Group>
        </Stack>
      </Paper>

      {buckets.length === 0 ? (
        <Empty title={tf.emptyTitle}>
          <Text size="sm" c="dimmed">
            {tf.emptyBody}
          </Text>
        </Empty>
      ) : visao === 'lista' ? (
        <RegistrosLista
          entradas={visiveis}
          documento={doc}
          ordem={ordem}
          onOrdem={(criterio, direcao) => setOrdem({ criterio, direcao })}
          onEditar={abrirAtividade}
        />
      ) : (
        <div className="tf-viewport" role="region" aria-label={tf.gridAria} tabIndex={0}>
          <div
            className="tf-grid"
            style={{
              gridTemplateColumns: `var(--tf-lane-w) repeat(${buckets.length}, ${larguraColuna})`,
            }}
          >
            <div className="tf-corner">{tf.corner(pessoasVisiveis.length)}</div>
            {buckets.map((b) => {
              const { titulo, sub } = rotuloBucket(b, gran);
              const fds = gran === 'dia' && isFimDeSemana(b);
              const isHoje = gran === 'dia' && b === hoje;
              return (
                <div key={b} id={`tf-col-${b}`} className={`tf-col-head${fds ? ' is-weekend' : ''}${isHoje ? ' is-today' : ''}`}>
                  <span className="tf-col-title">{titulo}</span>
                  <span className="tf-col-sub">{sub}</span>
                </div>
              );
            })}

            {pessoasVisiveis.map((p) => {
              const atividades = contagemPorPessoa(visiveis, p.nome);
              return (
                <LaneRow
                  key={p.id}
                  nome={p.nome}
                  cargo={p.cargo}
                  cor={corDaPessoa(doc, p.nome)}
                  atividades={atividades}
                  soltavel
                  buckets={buckets}
                  gran={gran}
                  hoje={hoje}
                  celulas={celulas}
                  documento={doc}
                  dropKey={dropKey}
                  setDropKey={setDropKey}
                  onSoltar={soltar}
                  onEditar={abrirAtividade}
                />
              );
            })}
            {visiveis.some((e) => e.pessoa === GERAL) && (
              <LaneRow
                nome={GERAL}
                rotulo={tf.general}
                cargo={tf.generalRole}
                cor="#64748B"
                atividades={contagemPorPessoa(visiveis, GERAL)}
                soltavel={false}
                buckets={buckets}
                gran={gran}
                hoje={hoje}
                celulas={celulas}
                documento={doc}
                dropKey={dropKey}
                setDropKey={setDropKey}
                onSoltar={soltar}
                onEditar={abrirAtividade}
              />
            )}
          </div>
        </div>
      )}

      <Text size="xs" c="dimmed" mt="sm" aria-live="polite">
        {conflito ? tf.notSaving : saving ? tf.saving : tf.saved} {tf.help}
      </Text>

      <EquipeDrawer
        opened={dialogo?.tipo === 'equipe'}
        onClose={() => setDialogo(null)}
        documento={doc}
        entradas={entradas}
        commit={commit}
        onRenamed={(antigo, novo) => setOcultas((o) => o.map((n) => (n === antigo ? novo : n)))}
        onRemoved={(nome) => setOcultas((o) => o.filter((n) => n !== nome))}
      />
      <SinaisDrawer
        opened={dialogo?.tipo === 'sinais'}
        onClose={() => setDialogo(null)}
        documento={doc}
        commit={commit}
        onRenamed={(antigo, novo) => setSinaisOn((s) => s.map((n) => (n === antigo ? novo : n)))}
        onRemoved={(nome) => setSinaisOn((s) => s.filter((n) => n !== nome))}
      />
      <TemasDrawer
        opened={dialogo?.tipo === 'temas'}
        onClose={() => setDialogo(null)}
        documento={doc}
        commit={commit}
        onRenamed={(antigo, novo) => setTemasOn((t) => t.map((n) => (n === antigo ? novo : n)))}
        onRemoved={(nome) => setTemasOn((t) => t.filter((n) => n !== nome))}
      />
      {dialogo?.tipo === 'troca' && (
        <TrocaModal opened onClose={() => setDialogo(null)} documento={doc} inicial={dialogo.registro} seed={dialogo.seed} commit={commit} />
      )}
      {dialogo?.tipo === 'atividade' && (
        <AtividadeModal opened onClose={() => setDialogo(null)} documento={doc} inicial={dialogo.registro} pessoa={dialogo.pessoa} commit={commit} />
      )}
    </>
  );
}

function LaneRow({
  nome,
  rotulo,
  cargo,
  cor,
  atividades,
  soltavel,
  buckets,
  gran,
  hoje,
  celulas,
  documento,
  dropKey,
  setDropKey,
  onSoltar,
  onEditar,
}: {
  /** The lane's key: a member's name, or `GERAL`. */
  nome: string;
  /** What the lane is called on screen, when it is not the key itself. */
  rotulo?: string;
  cargo: string;
  cor: string;
  atividades: number;
  /** A member's lane takes drops; the "Geral" lane holds lines nobody is named on, so it does not. */
  soltavel: boolean;
  buckets: string[];
  gran: Gran;
  hoje: string;
  celulas: Map<string, Entrada[]>;
  documento: Documento;
  dropKey: string | null;
  setDropKey: (key: string | null) => void;
  onSoltar: (pessoa: string, bucket: string, uid: string) => void;
  onEditar: (uid: string) => void;
}) {
  const t = useT();
  const tf = t.people.focus.page;
  const mostrado = rotulo ?? nome;
  return (
    <>
      <div className="tf-lane-label" style={{ ['--lane-c' as string]: cor }}>
        <span className="tf-avatar" style={{ background: cor }} aria-hidden>
          {iniciais(mostrado)}
        </span>
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} truncate>
            {mostrado}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {cargo || tf.member} · {tf.activities(atividades)}
          </Text>
        </div>
      </div>
      {buckets.map((b) => {
        const key = `${nome}|${b}`;
        const itens = celulas.get(key) ?? [];
        const fds = gran === 'dia' && isFimDeSemana(b);
        const soltando = dropKey === key;
        return (
          <div
            key={key}
            className={`tf-cell${fds ? ' is-weekend' : ''}${itens.length === 0 ? ' is-empty' : ''}${soltando ? ' is-drop' : ''}${b === hoje && gran === 'dia' ? ' is-today' : ''}`}
            style={{ ['--lane-c' as string]: cor }}
            onDragOver={(event) => {
              if (!soltavel || !event.dataTransfer.types.includes('text/plain')) return;
              event.preventDefault();
              if (dropKey !== key) setDropKey(key);
            }}
            onDragLeave={() => {
              if (dropKey === key) setDropKey(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const uid = event.dataTransfer.getData('text/plain');
              if (soltavel && uid) onSoltar(nome, b, uid);
            }}
          >
            {itens.map((e) => {
              const arrastar = (ev: DragEvent<HTMLElement>) => {
                ev.dataTransfer.setData('text/plain', e.uid);
                ev.dataTransfer.effectAllowed = 'move';
              };
              return e.tipo === 'troca' ? (
                <TrocaCard
                  key={e.uid}
                  icone={e.icone ?? '🔀'}
                  cor={e.corDestaque ?? '#6366F1'}
                  estilo={e.estiloLinha ?? 'borda-gradiente'}
                  de={e.deTema ?? tf.previous}
                  para={e.paraTema ?? tf.newFocus}
                  texto={e.texto}
                  onEdit={() => onEditar(e.uid)}
                  draggable
                  onDragStart={arrastar}
                />
              ) : (
                <TarefaCard
                  key={`${e.uid}-${e.pessoa}`}
                  documento={documento}
                  texto={e.texto}
                  temas={e.temas}
                  tags={e.tags}
                  onEdit={() => onEditar(e.uid)}
                  draggable
                  onDragStart={arrastar}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}
