import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  NumberInput,
  Pagination,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck, IconPlugConnected, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';

import {
  useBoardDetail,
  useBoards,
  useConnectionTest,
  useDiscovery,
  useFields,
  useHealth,
  usePeople,
  useSaveBoardSettings,
  useSaveOverrides,
  useSaveSelection,
} from '../api/hooks';
import type { BoardSettings, FieldMap } from '../api/types';
import { ErrorState, Loading, Note, PageHeader, useConfirm } from '../components/common';
import { NotificationsSettings } from '../components/NotificationsSettings';
import { PlanParametersSettings } from '../components/PlanParametersSettings';
import { useFilters } from '../lib/filters';
import { TIMEZONES, fromNow, plural, weekdays } from '../lib/format';

function ConnectionTab() {
  const health = useHealth();
  const test = useConnectionTest();
  const discovery = useDiscovery();
  return (
    <Stack gap="md" maw={760}>
      <Note>
        A credencial (e-mail + token de API) fica fora do repositório: variáveis <code>CADENCIA_JIRA_*</code> ou o arquivo
        <code> secrets/jira_api_token</code> montado no contêiner. A Cadência é somente leitura — nenhum caminho do código escreve no Jira.
      </Note>
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Text size="sm">
            Instância: <b>{health.data?.jira_base_url ?? 'não configurada'}</b> · banco: {health.data?.database ?? '—'} · fuso:{' '}
            {health.data?.timezone ?? '—'}
          </Text>
          <Group>
            <Button leftSection={<IconPlugConnected size={16} />} onClick={() => test.mutate()} loading={test.isPending} disabled={!health.data?.jira_configured}>
              Testar conexão
            </Button>
            <Button variant="default" onClick={() => discovery.mutate()} loading={discovery.isPending} disabled={!health.data?.jira_configured}>
              Descobrir boards e campos
            </Button>
          </Group>
          {test.error && <ErrorState error={test.error} />}
          {test.data?.ok && (
            <Alert color="teal" variant="light" icon={<IconCheck size={18} />} title="Conectado">
              Autenticado como {test.data.identity?.name} ({test.data.identity?.email ?? test.data.identity?.account_id}). Permissão de leitura de
              projetos: {test.data.permissions?.BROWSE_PROJECTS ? 'sim' : 'não'}.
            </Alert>
          )}
          {test.data && !test.data.ok && (
            <Alert color="red" variant="light" title={`Falhou: ${test.data.error?.cause}`}>
              {test.data.error?.message}
              <Text size="sm" fw={500} mt={4}>
                O que fazer: {test.data.error?.action}
              </Text>
            </Alert>
          )}
          {discovery.error && <ErrorState error={discovery.error} />}
          {discovery.data && (
            <Alert color={discovery.data.missing_fields.length ? 'yellow' : 'teal'} variant="light" title="Descoberta concluída">
              {discovery.data.boards.length} boards e {discovery.data.statuses.length} status encontrados.{' '}
              {discovery.data.missing_fields.length
                ? `Campos não identificados: ${discovery.data.missing_fields.join(', ')} — informe na aba Campos.`
                : 'Todos os campos customizados foram identificados.'}
            </Alert>
          )}
        </Stack>
      </Paper>
      <Text size="xs" c="dimmed">
        Configurando do zero? O <Anchor component={Link} to="/inicio">guia de primeiros passos</Anchor> leva pela conexão,
        os boards, os campos e a primeira coleta nessa ordem.
      </Text>
    </Stack>
  );
}

function BoardsTab() {
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const boards = useBoards(debounced, page, 25);
  const selectedNow = useBoards('', 1, 500, true);
  const save = useSaveSelection();
  const [draft, setDraft] = useState<Set<number> | null>(null);

  useEffect(() => {
    if (selectedNow.data && draft === null) setDraft(new Set(selectedNow.data.items.map((b) => b.id)));
  }, [selectedNow.data, draft]);
  useEffect(() => setPage(1), [debounced]);

  const toggle = (id: number) =>
    setDraft((current) => {
      const next = new Set(current ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Stack gap="sm">
      <Group align="flex-end" justify="space-between" wrap="wrap">
        <TextInput
          label="Buscar board ou time"
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          w={320}
        />
        <Group>
          <Text size="sm">{plural(draft?.size ?? 0, 'selecionado', 'selecionados')}</Text>
          <Button
            onClick={() =>
              draft &&
              save.mutate([...draft], {
                onSuccess: () => notifications.show({ title: 'Seleção salva', message: 'A próxima coleta inclui esses boards.' }),
              })
            }
            loading={save.isPending}
            disabled={!draft}
          >
            Salvar seleção
          </Button>
        </Group>
      </Group>
      {save.error && <ErrorState error={save.error} title="Seleção não salva" />}
      {boards.isLoading && <Loading />}
      {boards.error && <ErrorState error={boards.error} />}
      {boards.data && boards.data.total === 0 && (
        <Text size="sm" c="dimmed">
          Nenhum board conhecido. Use “Descobrir boards e campos” na aba Conexão (ou <code>cadencia discover</code>).
        </Text>
      )}
      {boards.data && boards.data.items.length > 0 && (
        <>
          <Table.ScrollContainer minWidth={700}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40}>
                    <span className="sr-only">Acompanhar</span>
                  </Table.Th>
                  <Table.Th>Board</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Última coleta</Table.Th>
                </Table.Tr>
              </Table.Thead>
              {boards.data.spaces.map((group) => (
                <Table.Tbody key={group.space.key ?? '__sem_espaco__'}>
                  <Table.Tr bg="var(--mantine-color-default-hover)">
                    <Table.Th colSpan={4} scope="colgroup">
                      <Group gap="xs" align="baseline">
                        <Text fw={600}>{group.space.name}</Text>
                        {group.space.key && (
                          <Text size="xs" c="dimmed" className="mono">
                            {group.space.key}
                          </Text>
                        )}
                        <Text size="xs" c="dimmed" fw={400}>
                          · time · {plural(group.boards.length, 'board', 'boards')}
                        </Text>
                      </Group>
                    </Table.Th>
                  </Table.Tr>
                  {group.boards.map((b) => (
                    <Table.Tr key={b.id}>
                      <Table.Td>
                        <Checkbox
                          checked={draft?.has(b.id) ?? false}
                          onChange={() => toggle(b.id)}
                          aria-label={`Acompanhar ${b.name} (${group.space.name})`}
                        />
                      </Table.Td>
                      <Table.Td>{b.name}</Table.Td>
                      <Table.Td>{b.type}</Table.Td>
                      <Table.Td>{b.selected ? fromNow(b.last_success_at) : '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              ))}
            </Table>
          </Table.ScrollContainer>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {boards.data.total} boards
            </Text>
            <Pagination total={Math.ceil(boards.data.total / boards.data.page_size)} value={page} onChange={setPage} size="sm" />
          </Group>
        </>
      )}
    </Stack>
  );
}

const FIELD_LABELS: Record<keyof FieldMap, string> = {
  story_points: 'Story Points (um ou mais ids, separados por vírgula)',
  sprint: 'Sprint',
  epic_link: 'Epic Link (projetos clássicos)',
  flagged: 'Flagged (impedimento)',
  rank: 'Rank (ordem do board)',
};

function FieldsTab() {
  const fields = useFields();
  const save = useSaveOverrides();
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (fields.data) {
      const o = fields.data.overrides;
      setDraft({
        story_points: (o.story_points ?? []).join(', '),
        sprint: o.sprint ?? '',
        epic_link: o.epic_link ?? '',
        flagged: o.flagged ?? '',
        rank: o.rank ?? '',
      });
    }
  }, [fields.data]);
  if (fields.isLoading) return <Loading />;
  if (fields.error) return <ErrorState error={fields.error} />;
  const data = fields.data!;
  const submit = () =>
    save.mutate(
      {
        story_points: draft.story_points ? draft.story_points.split(',').map((s) => s.trim()).filter(Boolean) : [],
        sprint: draft.sprint || null,
        epic_link: draft.epic_link || null,
        flagged: draft.flagged || null,
        rank: draft.rank || null,
      },
      { onSuccess: () => notifications.show({ title: 'Sobrescritas salvas', message: 'Vale a partir da próxima coleta.' }) },
    );
  return (
    <Stack gap="sm" maw={900}>
      <Note>
        Os ids de campos customizados mudam de instância para instância e são descobertos automaticamente. Só preencha uma sobrescrita se a
        descoberta errar.
      </Note>
      {data.missing.length > 0 && (
        <Alert color="yellow" variant="light">
          Campos não identificados: {data.missing.join(', ')}.
        </Alert>
      )}
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Campo</Table.Th>
            <Table.Th>Descoberto</Table.Th>
            <Table.Th>Sobrescrita manual</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(Object.keys(FIELD_LABELS) as (keyof FieldMap)[]).map((key) => {
            const discovered = data.discovered[key];
            return (
              <Table.Tr key={key}>
                <Table.Td>{FIELD_LABELS[key]}</Table.Td>
                <Table.Td className="mono">{Array.isArray(discovered) ? discovered.join(', ') || '—' : discovered ?? '—'}</Table.Td>
                <Table.Td>
                  <TextInput
                    aria-label={`Sobrescrita de ${FIELD_LABELS[key]}`}
                    placeholder="customfield_…"
                    value={draft[key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [key]: e.currentTarget.value })}
                  />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Group>
        <Button onClick={() => submit()} loading={save.isPending}>
          Salvar sobrescritas
        </Button>
        {save.error && <ErrorState error={save.error} title="Sobrescritas não salvas" />}
      </Group>
    </Stack>
  );
}


const DISCARD = {
  title: 'Descartar alterações?',
  body: 'Há alterações não salvas neste perfil de board.',
  confirmLabel: 'Descartar',
};

/**
 * The board's own profile. It reads and writes its own ``perfil`` parameter (not the shared ``board`` filter,
 * which the flow page uses), and it keeps the edits: a board or tab change asks first, and the save
 * bar says how many changes are waiting.
 */
function ProfileTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const selected = useBoards('', 1, 500, true);
  const people = usePeople();
  const { get, set } = useFilters();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const boardId = get('perfil') ? Number(get('perfil')) : selected.data?.items[0]?.id;
  const detail = useBoardDetail(boardId);
  const save = useSaveBoardSettings(boardId);
  const [draft, setDraft] = useState<BoardSettings | null>(null);
  const [affinityQuery, setAffinityQuery] = useState('');
  useEffect(() => {
    if (detail.data) setDraft(detail.data.settings);
  }, [detail.data]);

  const peopleOptions = useMemo(() => (people.data?.items ?? []).map((p) => ({ value: p.account_id, label: p.name })), [people.data]);
  const columns = (detail.data?.columns ?? []).map((c) => c.name);

  // Only what differs from the saved profile is sent, and the count of it is what "não salvas" means.
  const changed = (): Partial<BoardSettings> => {
    if (!draft || !detail.data) return {};
    const original = detail.data.settings;
    return Object.fromEntries(
      (Object.keys(draft) as (keyof BoardSettings)[])
        .filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(original[k]))
        .map((k) => [k, draft[k]]),
    ) as Partial<BoardSettings>;
  };
  const pending = Object.keys(changed()).length;
  useEffect(() => onDirtyChange(pending > 0), [pending, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const switchBoard = async (value: string | null) => {
    if (!value) return;
    if (pending && !(await confirm(DISCARD))) return;
    set({ perfil: value });
  };

  if (selected.data && !selected.data.items.length) return <Text size="sm">Selecione boards na aba Boards primeiro.</Text>;
  if (detail.isLoading || !draft) return <Loading />;
  if (detail.error) return <ErrorState error={detail.error} />;

  const patch = <K extends keyof BoardSettings>(key: K, value: BoardSettings[K]) => setDraft({ ...draft, [key]: value });
  const num = (value: string | number, fallback: number) => (value === '' ? fallback : Number(value));
  // The thresholds are stored as a fraction of the remaining capacity; people read them as a percentage of it.
  const percentOf = (fraction: number) => Math.round((1 + fraction) * 100);
  const fractionOf = (percent: number | string, fallback: number) => (percent === '' ? fallback : Number((Number(percent) / 100 - 1).toFixed(4)));
  const affinityPeople = (draft.members.length ? draft.members : peopleOptions.map((p) => p.value))
    .map((account) => ({ account, label: peopleOptions.find((p) => p.value === account)?.label ?? account }))
    .filter((p) => p.label.toLocaleLowerCase('pt-BR').includes(affinityQuery.trim().toLocaleLowerCase('pt-BR')));

  return (
    <Stack gap="md" maw={1000}>
      <Select
        label="Board"
        data={(selected.data?.items ?? []).map((b) => ({ value: String(b.id), label: b.name }))}
        value={boardId ? String(boardId) : null}
        onChange={switchBoard}
        w={300}
        allowDeselect={false}
      />
      {detail.data!.overridden.length > 0 && (
        <Text size="xs" c="dimmed">
          Diferente do padrão global: {detail.data!.overridden.join(', ')}
        </Text>
      )}
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          Fluxo do board
        </Title>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <MultiSelect
            label="Colunas de trabalho em andamento"
            description="vazio: colunas cujos status estão na categoria “em andamento”"
            data={columns}
            value={draft.wip_columns ?? []}
            onChange={(value) => patch('wip_columns', value.length ? value : null)}
          />
          <MultiSelect
            label="Colunas ativas (eficiência de fluxo)"
            description="vazio: as mesmas de andamento"
            data={columns}
            value={draft.active_columns ?? []}
            onChange={(value) => patch('active_columns', value.length ? value : null)}
          />
          <TagsInput label="Status que significam bloqueio" value={draft.blocked_status_names} onChange={(value) => patch('blocked_status_names', value)} />
        </SimpleGrid>
      </Paper>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          Checkpoint e sprint
        </Title>
        <SimpleGrid cols={{ base: 1, md: 4 }}>
          <Select
            label="Dia do checkpoint"
            data={weekdays().map((d, i) => ({ value: String(i), label: d }))}
            value={String(draft.checkpoint_weekday)}
            onChange={(value) => value && patch('checkpoint_weekday', Number(value))}
            allowDeselect={false}
          />
          <NumberInput label="Hora do checkpoint" min={0} max={23} value={draft.checkpoint_hour} onChange={(v) => patch('checkpoint_hour', num(v, 18))} />
          <Select label="Fuso horário" data={TIMEZONES} value={draft.timezone} onChange={(value) => value && patch('timezone', value)} searchable allowDeselect={false} />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Duração quando o Jira não informa
            </Text>
            <SegmentedControl
              value={String(draft.default_sprint_weeks)}
              onChange={(value) => patch('default_sprint_weeks', Number(value))}
              data={[
                { value: '2', label: '2 semanas' },
                { value: '3', label: '3 semanas' },
              ]}
            />
          </Stack>
          <NumberInput
            label="Limiar de estagnação"
            description="checkpoints seguidos sem transição"
            min={1}
            max={6}
            value={draft.stagnation_checkpoints}
            onChange={(v) => patch('stagnation_checkpoints', num(v, 1))}
          />
          <NumberInput
            label="Percentil de envelhecimento"
            description="aprendido do histórico"
            min={50}
            max={99}
            value={draft.aging_percentile}
            onChange={(v) => patch('aging_percentile', num(v, 85))}
          />
          <TagsInput
            label="Feriados (AAAA-MM-DD)"
            value={draft.holidays}
            onChange={(value) => patch('holidays', value.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))}
          />
        </SimpleGrid>
      </Paper>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          Capacidade e alocação teórica
        </Title>
        <SimpleGrid cols={{ base: 1, md: 4 }}>
          <NumberInput
            label="Horas por dia"
            description="Bruta; a capacidade líquida multiplica pelo fator de foco abaixo."
            min={1}
            max={12}
            value={draft.hours_per_day}
            onChange={(v) => patch('hours_per_day', num(v, 8))}
          />
          <NumberInput label="Fator de foco" min={0.1} max={1} step={0.05} decimalScale={2} value={draft.focus_factor} onChange={(v) => patch('focus_factor', num(v, 0.7))} />
          <NumberInput label="Horas por ponto" min={0.5} step={0.5} value={draft.hours_per_point} onChange={(v) => patch('hours_per_point', num(v, 4))} />
          <NumberInput label="Horas de item sem estimativa" min={1} value={draft.unestimated_item_hours} onChange={(v) => patch('unestimated_item_hours', num(v, 8))} />
          <NumberInput label="Máximo de itens por pessoa" min={1} value={draft.max_items_per_person} onChange={(v) => patch('max_items_per_person', num(v, 8))} />
          <Text size="xs" c="dimmed" style={{ gridColumn: '1 / -1' }}>
            O plano de épico usa a própria jornada (Configuração → Plano de épico), pensada para várias pessoas em vários
            boards ao mesmo tempo, em vez das horas por dia deste board.
          </Text>
          <NumberInput
            label="Sobrecarga: acima de"
            description="Vale para Pessoas e para o planejamento."
            suffix=" % da capacidade"
            min={0}
            step={5}
            value={percentOf(draft.overload_threshold)}
            onChange={(v) => patch('overload_threshold', fractionOf(v, 0.1))}
          />
          <NumberInput
            label="Folga: abaixo de"
            description="Vale para Pessoas e para o planejamento."
            suffix=" % da capacidade"
            min={0}
            step={5}
            value={percentOf(draft.idle_threshold)}
            onChange={(v) => patch('idle_threshold', fractionOf(v, -0.2))}
          />
          <MultiSelect
            label="Quem conta na capacidade deste board"
            description="vazio: quem tem itens na sprint"
            data={peopleOptions}
            value={draft.members}
            onChange={(value) => patch('members', value)}
            searchable
          />
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="md">
          A pessoa em si — nome, função, descrição — é de <Anchor component={Link} to="/pessoas" size="xs">Pessoas</Anchor>; aqui só
          quem entra no cálculo de capacidade deste board e a afinidade que só faz sentido nele.
        </Text>
        <Text size="sm" fw={500} mt="xs">
          Afinidade explícita (componentes ou etiquetas que cada pessoa atende)
        </Text>
        <TextInput
          size="xs"
          mt={4}
          placeholder="Buscar pessoa pelo nome"
          aria-label="Buscar pessoa na afinidade"
          leftSection={<IconSearch size={12} />}
          value={affinityQuery}
          onChange={(e) => setAffinityQuery(e.currentTarget.value)}
          w={260}
        />
        <Stack gap={4} mt={4}>
          {affinityPeople.slice(0, 30).map(({ account, label }) => (
            <TagsInput
              key={account}
              label={label}
              value={draft.affinity[account] ?? []}
              onChange={(value) => patch('affinity', { ...draft.affinity, [account]: value })}
              size="xs"
            />
          ))}
        </Stack>
        {affinityPeople.length > 30 && (
          <Text size="xs" c="dimmed" mt={4}>
            mostrando 30 de {affinityPeople.length}; busque para ver as outras
          </Text>
        )}
      </Paper>
      {/* A bar that stays at the foot of the form, so the save is in reach wherever the edit was made. */}
      <Paper withBorder p="sm" style={{ position: 'sticky', bottom: 8, zIndex: 2 }}>
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Text size="sm" c={pending ? undefined : 'dimmed'}>
            {pending ? plural(pending, 'alteração não salva', 'alterações não salvas') : 'Nada a salvar'}
          </Text>
          <Group gap="sm">
            {save.error && <ErrorState error={save.error} title="Perfil não salvo" />}
            <Button
              disabled={!pending}
              loading={save.isPending}
              onClick={() => save.mutate(changed(), { onSuccess: () => notifications.show({ title: 'Salvo', message: 'O board passa a usar os novos valores.' }) })}
            >
              Salvar perfil do board
            </Button>
          </Group>
        </Group>
      </Paper>
      {confirmDialog}
    </Stack>
  );
}

export function SettingsPage() {
  const { get, set } = useFilters();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [profileDirty, setProfileDirty] = useState(false);
  const tab = get('tab') ?? 'conexao';
  // Absences are the team's, so they live on Pessoas now; an old link lands there.
  if (tab === 'ausencias') return <Navigate to="/pessoas?ausencias=1" replace />;
  // Leaving a profile with unsaved edits asks first.
  const goTo = async (value: string | null) => {
    if (!value || value === tab) return;
    if (tab === 'perfil' && profileDirty && !(await confirm(DISCARD))) return;
    set({ tab: value });
  };
  return (
    <>
      <PageHeader title="Configuração" subtitle="Conexão, boards acompanhados, campos da instância, perfil de cada board, notificações e os parâmetros do plano de épico." />
      <Tabs value={tab} onChange={goTo} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="conexao">Conexão</Tabs.Tab>
          <Tabs.Tab value="boards">Boards</Tabs.Tab>
          <Tabs.Tab value="campos">Campos</Tabs.Tab>
          <Tabs.Tab value="perfil">Perfil do board</Tabs.Tab>
          <Tabs.Tab value="plano-epico">Plano de épico</Tabs.Tab>
          <Tabs.Tab value="notificacoes">Notificações</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="notificacoes">
          <NotificationsSettings />
        </Tabs.Panel>
        <Tabs.Panel value="conexao">
          <ConnectionTab />
        </Tabs.Panel>
        <Tabs.Panel value="boards">
          <BoardsTab />
        </Tabs.Panel>
        <Tabs.Panel value="campos">
          <FieldsTab />
        </Tabs.Panel>
        <Tabs.Panel value="perfil">
          <ProfileTab onDirtyChange={setProfileDirty} />
        </Tabs.Panel>
        <Tabs.Panel value="plano-epico">
          <PlanParametersSettings />
        </Tabs.Panel>
      </Tabs>
      {confirmDialog}
    </>
  );
}
